// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { boards, directUploadSessions, mediaItems } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";
import {
  headStoredObject,
  publicPathForStorageKey,
  readStoredObject,
  scopedMediaStorageKey,
  thumbnailStorageKeyFromStorageKey,
} from "@/lib/media-storage";
import {
  ALLOWED_VIDEO_POSTER_TYPES,
  mediaTypeFromContentType,
  validateUploadFilename,
} from "@/lib/media-upload";
import {
  clampMediaDuration,
  DEFAULT_MEDIA_DURATION_SECONDS,
  MAX_MEDIA_DURATION_SECONDS,
} from "@/lib/media-duration";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  assertCanUploadMedia,
  assertImageResolutionAllowed,
  assertVideoResolutionAllowed,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";
import { assertCanAddBoardMedia } from "@/lib/board-media-plan";
import { probeVideoMetadataFromBuffer } from "@/lib/video-metadata";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const DIRECT_UPLOAD_COMPLETE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DIRECT_UPLOAD_COMPLETE_RATE_LIMIT_MAX = 120;

const directUploadCompleteSchema = z.object({
  boardId: z.string().min(1),
  mediaId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  objectKey: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().int().positive().max(MAX_MEDIA_DURATION_SECONDS).optional(),
  poster: z.object({
    objectKey: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  }).optional(),
});

function planLimitResponse(error: unknown) {
  if (isPlanLimitError(error)) {
    return NextResponse.json(planLimitErrorBody(error), { status: 403 });
  }
  return null;
}

function normalizeContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function contentTypesMatch(storedContentType: string, declaredContentType: string) {
  return normalizeContentType(storedContentType) === normalizeContentType(declaredContentType);
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("[media/direct/complete] Failed to complete direct upload", error);
    return NextResponse.json(
      { error: "メディアのアップロードに失敗しました" },
      { status: 500 },
    );
  }
}

async function handlePost(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = directUploadCompleteSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const {
    boardId,
    mediaId,
    fileName,
    objectKey,
    contentType,
    sizeBytes,
    width,
    height,
    duration,
    poster,
  } = result.data;
  const mediaType = mediaTypeFromContentType(contentType);
  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 },
    );
  }
  const fileNameValidation = validateUploadFilename({ fileName, contentType });
  if (!fileNameValidation.ok) {
    return NextResponse.json(
      { error: fileNameValidation.error, code: "invalid_file_extension" },
      { status: 400 },
    );
  }

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });
  const ownerUserId = resolveOwnerUserId(session.user);
  if (!board || board.ownerUserId !== ownerUserId) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const uploadRateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "upload",
      clientIp: resolveRateLimitClientIp(request),
      subject: ownerUserId,
    }),
    windowMs: DIRECT_UPLOAD_COMPLETE_RATE_LIMIT_WINDOW_MS,
    maxAttempts: DIRECT_UPLOAD_COMPLETE_RATE_LIMIT_MAX,
  });
  if (uploadRateLimit.limited) {
    return NextResponse.json(
      { error: "アップロード回数の上限に達しました", code: "upload_rate_limited" },
      { status: 429 },
    );
  }

  const expectedObjectKey = scopedMediaStorageKey({
    ownerUserId: board.ownerUserId,
    boardId,
    mediaId,
    extension: fileNameValidation.extension,
  });
  if (objectKey !== expectedObjectKey) {
    return NextResponse.json({ error: "Invalid object key" }, { status: 400 });
  }

  if (poster) {
    const expectedPosterKey = thumbnailStorageKeyFromStorageKey(expectedObjectKey);
    if (
      poster.objectKey !== expectedPosterKey
      || !(ALLOWED_VIDEO_POSTER_TYPES as readonly string[]).includes(poster.contentType)
    ) {
      return NextResponse.json({ error: "Invalid poster upload" }, { status: 400 });
    }
  }

  const uploadSession = await db.query.directUploadSessions.findFirst({
    where: and(
      eq(directUploadSessions.mediaId, mediaId),
      eq(directUploadSessions.ownerUserId, ownerUserId),
      eq(directUploadSessions.boardId, boardId),
    ),
  });
  if (!uploadSession) {
    return NextResponse.json(
      {
        error: "Direct upload session not found",
        code: "direct_upload_session_not_found",
      },
      { status: 404 },
    );
  }
  if (uploadSession.expiresAt <= new Date().toISOString()) {
    return NextResponse.json(
      {
        error: "Direct upload session expired",
        code: "direct_upload_session_expired",
      },
      { status: 410 },
    );
  }
  if (
    uploadSession.objectKey !== objectKey
    || uploadSession.posterObjectKey !== (poster?.objectKey ?? null)
  ) {
    return NextResponse.json(
      { error: "Invalid direct upload session" },
      { status: 400 },
    );
  }

  const object = await headStoredObject(objectKey);
  if (!object) {
    return NextResponse.json({ error: "Uploaded object not found" }, { status: 404 });
  }
  if (object.contentLength !== sizeBytes) {
    return NextResponse.json(
      { error: "Uploaded object size does not match" },
      { status: 400 },
    );
  }
  if (!contentTypesMatch(object.contentType, contentType)) {
    return NextResponse.json(
      { error: "Uploaded object content type does not match" },
      { status: 400 },
    );
  }

  let posterSizeBytes = 0;
  if (poster) {
    const posterObject = await headStoredObject(poster.objectKey);
    if (!posterObject) {
      return NextResponse.json({ error: "Uploaded poster not found" }, { status: 404 });
    }
    if (posterObject.contentLength !== poster.sizeBytes) {
      return NextResponse.json(
        { error: "Uploaded poster size does not match" },
        { status: 400 },
      );
    }
    if (!contentTypesMatch(posterObject.contentType, poster.contentType)) {
      return NextResponse.json(
        { error: "Uploaded poster content type does not match" },
        { status: 400 },
      );
    }
    posterSizeBytes = posterObject.contentLength;
  }

  let serverVideoWidth: number | null = null;
  let serverVideoHeight: number | null = null;
  let serverVideoDurationSeconds: number | null = null;
  if (mediaType === "video") {
    const storedVideo = await readStoredObject(objectKey);
    if (!storedVideo) {
      return NextResponse.json({ error: "Uploaded object not found" }, { status: 404 });
    }

    let metadata;
    try {
      metadata = await probeVideoMetadataFromBuffer(
        storedVideo.body,
        fileNameValidation.extension,
      );
    } catch (error) {
      console.error("[media/direct/complete] Failed to read video metadata", error);
      return NextResponse.json(
        {
          error: "動画メタデータを取得できませんでした",
          code: "video_metadata_unavailable",
        },
        { status: 400 },
      );
    }

    serverVideoWidth = metadata.width;
    serverVideoHeight = metadata.height;
    serverVideoDurationSeconds = metadata.durationSeconds;
  }

  try {
    await assertCanUploadMedia({
      ownerUserId,
      mediaType,
      fileSize: sizeBytes,
      additionalStorageBytes: object.contentLength + posterSizeBytes,
    });

    if (mediaType === "image" && width && height) {
      await assertImageResolutionAllowed({
        ownerUserId,
        longEdge: Math.max(width, height),
      });
    }

    if (mediaType === "video") {
      if (!serverVideoWidth || !serverVideoHeight) {
        return NextResponse.json(
          {
            error: "動画メタデータを取得できませんでした",
            code: "video_metadata_unavailable",
          },
          { status: 400 },
        );
      }

      await assertVideoResolutionAllowed({
        ownerUserId,
        width: serverVideoWidth,
        height: serverVideoHeight,
      });
    }
    await assertCanAddBoardMedia({
      ownerUserId,
      boardId,
      templateId: board.templateId,
      mediaType,
      videoDurationSeconds: serverVideoDurationSeconds,
    });
  } catch (error) {
    const response = planLimitResponse(error);
    if (response) return response;
    throw error;
  }

  const existing = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.boardId, boardId));
  const maxOrder = existing.reduce(
    (max, item) => Math.max(max, item.displayOrder),
    -1,
  );
  const [created] = await db
    .insert(mediaItems)
    .values({
      id: mediaId,
      boardId,
      type: mediaType,
      filePath: publicPathForStorageKey(objectKey),
      fileSizeBytes: object.contentLength,
      thumbnailSizeBytes: posterSizeBytes,
      width: mediaType === "video" ? serverVideoWidth : width ?? null,
      height: mediaType === "video" ? serverVideoHeight : height ?? null,
      videoDurationSeconds: mediaType === "video" ? serverVideoDurationSeconds : null,
      displayOrder: maxOrder + 1,
      duration: duration ? clampMediaDuration(duration) : DEFAULT_MEDIA_DURATION_SECONDS,
      playbackMode: "duration",
    })
    .returning();

  try {
    await db
      .delete(directUploadSessions)
      .where(eq(directUploadSessions.mediaId, mediaId));
  } catch (error) {
    console.error(
      "[media/direct/complete] Failed to consume direct upload session",
      error,
    );
  }

  emitSSE(boardId, "media-updated");

  return NextResponse.json(
    {
      success: true,
      media: created,
    },
    { status: 201 },
  );
}
