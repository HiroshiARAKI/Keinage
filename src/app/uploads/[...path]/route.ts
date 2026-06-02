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
  BOARD_DISPLAY_ACCESS_QUERY_PARAM,
  hasRecentBoardDisplayAccess,
  normalizeBoardDeviceKey,
} from "@/lib/board-device-status";
import {
  createCloudFrontSignedUrl,
  isCloudFrontSignedDeliveryMode,
} from "@/lib/cloudfront-signed-url";
import { isInOwnerScope } from "@/lib/ownership";
import {
  headStoredObject,
  mediaStorageDriver,
  readStoredObject,
  readStoredObjectRange,
  storageKeyFromPublicPath,
  thumbnailStorageKeyFromPublicPath,
} from "@/lib/media-storage";

/** Disable static caching so newly uploaded files are served immediately. */
export const dynamic = "force-dynamic";

type MediaDeliveryRef = {
  boardId: string;
  filePath?: string;
  visibility: string;
  ownerUserId: string;
  isActive: boolean;
  status: string;
};

type ParsedByteRange = {
  start: number;
  end: number;
};

function cacheControlForAccess(requiresPrivateScope: boolean): string {
  return requiresPrivateScope
    ? "private, max-age=3600, must-revalidate"
    : "public, max-age=31536000, immutable";
}

function parseByteRange(rangeHeader: string | null, totalLength: number): ParsedByteRange | null | "unsatisfiable" {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || totalLength <= 0) {
    return null;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(totalLength - suffixLength, 0);
    return { start, end: totalLength - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : totalLength - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || requestedEnd < start
    || start >= totalLength
  ) {
    return "unsatisfiable";
  }

  return {
    start,
    end: Math.min(requestedEnd, totalLength - 1),
  };
}

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

async function canAccessMediaRef(
  request: NextRequest,
  refs: MediaDeliveryRef[],
): Promise<{
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
  if (session) {
    const allowed = displayableRefs.some((ref) =>
      isInOwnerScope(session.user, ref.ownerUserId),
    );
    if (allowed) {
      return { allowed: true, requiresPrivateScope };
    }
  }

  const displayDeviceKey = normalizeBoardDeviceKey(
    request.nextUrl.searchParams.get(BOARD_DISPLAY_ACCESS_QUERY_PARAM),
  );
  if (!displayDeviceKey) {
    return { allowed: false, requiresPrivateScope };
  }

  let allowedByDisplayAccess = false;
  for (const ref of displayableRefs) {
    if (
      await hasRecentBoardDisplayAccess({
        board: { id: ref.boardId, ownerUserId: ref.ownerUserId },
        deviceKey: displayDeviceKey,
      })
    ) {
      allowedByDisplayAccess = true;
      break;
    }
  }

  return { allowed: allowedByDisplayAccess, requiresPrivateScope };
}

async function serveStoredObject(
  request: NextRequest,
  storageKey: string,
  requiresPrivateScope: boolean,
): Promise<NextResponse> {
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const metadata = await headStoredObject(storageKey);
    if (!metadata) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const range = parseByteRange(rangeHeader, metadata.contentLength);
    if (range === "unsatisfiable") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${metadata.contentLength}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControlForAccess(requiresPrivateScope),
        },
      });
    }

    if (range) {
      const object = await readStoredObjectRange(storageKey, range.start, range.end);
      if (!object) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return new NextResponse(new Uint8Array(object.body), {
        status: 206,
        headers: {
          "Content-Type": object.contentType,
          "Content-Length": object.contentLength.toString(),
          "Content-Range": object.contentRange,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControlForAccess(requiresPrivateScope),
        },
      });
    }
  }

  const object = await readStoredObject(storageKey);
  if (!object) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.body), {
    status: 200,
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": object.contentLength.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControlForAccess(requiresPrivateScope),
    },
  });
}

async function handleMediaIdDelivery(
  request: NextRequest,
  mediaId: string,
  variant: "original" | "thumbnail",
): Promise<NextResponse> {
  const refs = await db
    .select({
      boardId: boards.id,
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

  const access = await canAccessMediaRef(request, refs);
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

  return serveStoredObject(request, storageKey, true);
}

/**
 * GET /uploads/[...path] — serve uploaded media files.
 *
 * Next.js standalone mode does not serve files that are dynamically added to
 * public/ after the build. This route handler fills that gap by reading the
 * backing storage object and streaming it back with the correct Content-Type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = await params;
  const filename = segments.path.join("/");
  const mediaIdRoute = mediaIdRouteFromSegments(segments.path);
  if (mediaIdRoute) {
    try {
      return await handleMediaIdDelivery(request, mediaIdRoute.mediaId, mediaIdRoute.variant);
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
      boardId: boards.id,
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

  const access = await canAccessMediaRef(request, mediaRefs);
  if (mediaRefs.length > 0 && !access.allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return await serveStoredObject(request, filename, access.requiresPrivateScope);
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
