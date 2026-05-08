// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { boards, mediaItems } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import {
  createCloudFrontSignedUrl,
  isCloudFrontSignedDeliveryMode,
} from "@/lib/cloudfront-signed-url";
import { isInOwnerScope } from "@/lib/ownership";
import {
  mediaStorageDriver,
  readStoredObject,
  storageKeyFromPublicPath,
  thumbnailStorageKeyFromPublicPath,
} from "@/lib/media-storage";

/** Disable static caching so newly uploaded files are served immediately. */
export const dynamic = "force-dynamic";

type MediaDeliveryRef = {
  filePath?: string;
  visibility: string;
  ownerUserId: string;
  isActive: boolean;
  status: string;
};

function buildCandidateMediaPaths(filename: string): string[] {
  const publicPath = `/uploads/${filename}`;
  if (!filename.startsWith("thumbs/") && !filename.includes("/thumbs/")) {
    return [publicPath];
  }

  const thumbName = path.posix.basename(filename);
  const ext = path.posix.extname(thumbName).toLowerCase();
  const base = thumbName.slice(0, thumbName.length - ext.length);
  const thumbPrefix = "thumbs/";
  const thumbnailSegment = `/${thumbPrefix}`;
  const originalPrefix = filename.startsWith(thumbPrefix)
    ? ""
    : filename.slice(0, filename.lastIndexOf(thumbnailSegment) + 1);
  const candidates = [`/uploads/${originalPrefix}${base}${ext}`];

  // GIF thumbnails are generated as JPG files.
  if (ext === ".jpg") {
    candidates.push(`/uploads/${originalPrefix}${base}.gif`);
    candidates.push(`/uploads/${originalPrefix}${base}.mp4`);
    candidates.push(`/uploads/${originalPrefix}${base}.webm`);
  }

  return [...new Set(candidates)];
}

function mediaIdRouteFromSegments(pathSegments: string[]):
  | { mediaId: string; variant: "original" | "thumbnail" }
  | null {
  const [firstSegment, secondSegment] = pathSegments;

  if (pathSegments.length === 1 && firstSegment && !firstSegment.includes(".")) {
    return { mediaId: firstSegment, variant: "original" };
  }

  if (pathSegments.length === 2 && firstSegment === "thumbs" && secondSegment && !secondSegment.includes(".")) {
    return { mediaId: secondSegment, variant: "thumbnail" };
  }

  return null;
}

async function canAccessMediaRef(refs: MediaDeliveryRef[]): Promise<{
  allowed: boolean;
  requiresPrivateScope: boolean;
}> {
  const displayableRefs = refs.filter((ref) => isBoardDisplayable(ref));
  if (displayableRefs.length === 0) {
    return { allowed: false, requiresPrivateScope: false };
  }

  const hasPublicRef = displayableRefs.some((ref) => ref.visibility === "public");
  const requiresPrivateScope = !hasPublicRef;

  if (!requiresPrivateScope) {
    return { allowed: true, requiresPrivateScope };
  }

  const session = await getSessionUser();
  if (!session) {
    return { allowed: false, requiresPrivateScope };
  }

  return {
    allowed: displayableRefs.some((ref) =>
      isInOwnerScope(session.user, ref.ownerUserId),
    ),
    requiresPrivateScope,
  };
}

async function serveStoredObject(
  storageKey: string,
  requiresPrivateScope: boolean,
): Promise<NextResponse> {
  const object = await readStoredObject(storageKey);
  if (!object) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.body), {
    status: 200,
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": object.contentLength.toString(),
      "Cache-Control": requiresPrivateScope
        ? "private, no-store"
        : "public, max-age=31536000, immutable",
    },
  });
}

async function handleMediaIdDelivery(
  mediaId: string,
  variant: "original" | "thumbnail",
): Promise<NextResponse> {
  const refs = await db
    .select({
      filePath: mediaItems.filePath,
      visibility: boards.visibility,
      ownerUserId: boards.ownerUserId,
      isActive: boards.isActive,
      status: boards.status,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(eq(mediaItems.id, mediaId));

  if (refs.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await canAccessMediaRef(refs);
  if (!access.allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ref = refs[0];
  const storageKey = variant === "thumbnail"
    ? thumbnailStorageKeyFromPublicPath(ref.filePath)
    : storageKeyFromPublicPath(ref.filePath);

  if (isCloudFrontSignedDeliveryMode() && mediaStorageDriver() === "s3") {
    const signedUrl = createCloudFrontSignedUrl(storageKey);
    const response = NextResponse.redirect(signedUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  return serveStoredObject(storageKey, true);
}

/**
 * GET /uploads/[...path] — serve uploaded media files.
 *
 * Next.js standalone mode does not serve files that are dynamically added to
 * public/ after the build. This route handler fills that gap by reading the
 * backing storage object and streaming it back with the correct Content-Type.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = await params;
  const filename = segments.path.join("/");
  const mediaIdRoute = mediaIdRouteFromSegments(segments.path);
  if (mediaIdRoute) {
    try {
      return await handleMediaIdDelivery(mediaIdRoute.mediaId, mediaIdRoute.variant);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid storage key") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      console.error("[uploads] Failed to deliver media route", {
        mediaId: mediaIdRoute.mediaId,
        variant: mediaIdRoute.variant,
        error,
      });
      return NextResponse.json(
        { error: "Failed to read upload" },
        { status: 500 },
      );
    }
  }

  const candidateMediaPaths = buildCandidateMediaPaths(filename);
  const mediaRefs = await db
    .select({
      visibility: boards.visibility,
      ownerUserId: boards.ownerUserId,
      isActive: boards.isActive,
      status: boards.status,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(
      candidateMediaPaths.length === 1
        ? eq(mediaItems.filePath, candidateMediaPaths[0])
        : or(...candidateMediaPaths.map((filePath) => eq(mediaItems.filePath, filePath))),
    );

  const access = await canAccessMediaRef(mediaRefs);
  if (mediaRefs.length > 0 && !access.allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return await serveStoredObject(filename, access.requiresPrivateScope);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid storage key") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to read upload" },
      { status: 500 },
    );
  }
}
