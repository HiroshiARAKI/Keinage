// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { boards, mediaItems } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isInOwnerScope } from "@/lib/ownership";
import { readStoredObject } from "@/lib/media-storage";

/** Disable static caching so newly uploaded files are served immediately. */
export const dynamic = "force-dynamic";

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

  const candidateMediaPaths = buildCandidateMediaPaths(filename);
  const mediaRefs = await db
    .select({
      visibility: boards.visibility,
      ownerUserId: boards.ownerUserId,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(
      candidateMediaPaths.length === 1
        ? eq(mediaItems.filePath, candidateMediaPaths[0])
        : or(...candidateMediaPaths.map((filePath) => eq(mediaItems.filePath, filePath))),
    );

  const hasPublicRef = mediaRefs.some((ref) => ref.visibility === "public");
  const requiresPrivateScope = mediaRefs.length > 0 && !hasPublicRef;

  if (requiresPrivateScope) {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const canAccess = mediaRefs.some((ref) =>
      isInOwnerScope(session.user, ref.ownerUserId),
    );
    if (!canAccess) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const object = await readStoredObject(filename);
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
