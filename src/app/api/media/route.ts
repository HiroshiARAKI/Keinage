// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaItems, boards } from "@/db/schema";
import { and, eq, asc, inArray } from "drizzle-orm";
import { getAdminSessionUser, getSessionUser } from "@/lib/auth";
import { updateMediaOrderSchema } from "@/lib/validators";
import { emitSSE } from "@/lib/sse";
import {
  resizeImage,
  generateThumbnail,
  getImageDimensions,
  getImageLongEdge,
  DEFAULT_IMAGE_MAX_LONG_EDGE,
} from "@/lib/image";
import {
  ALLOWED_TYPES,
  ALLOWED_VIDEO_POSTER_TYPES,
  mediaTypeFromContentType,
  validateUploadFilename,
} from "@/lib/media-upload";
import {
  deleteStoredObject,
  publicPathForStorageKey,
  scopedMediaStorageKey,
  storageKeyFromPublicPath,
  thumbnailStorageKeyFromStorageKey,
  thumbnailStorageKeyFromPublicPath,
  writeStoredObject,
} from "@/lib/media-storage";
import { clampMediaDuration, DEFAULT_MEDIA_DURATION_SECONDS } from "@/lib/media-duration";
import { getOwnerSetting } from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  assertCanUploadMedia,
  assertImageResolutionAllowed,
  assertVideoResolutionAllowed,
  getEffectiveImageMaxLongEdge,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";
import { probeVideoMetadataFromBuffer } from "@/lib/video-metadata";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import { randomUUID } from "crypto";
import path from "path";

const UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const UPLOAD_RATE_LIMIT_MAX = 120;

function planLimitResponse(error: unknown) {
  if (isPlanLimitError(error)) {
    return NextResponse.json(planLimitErrorBody(error), { status: 403 });
  }
  return null;
}

function videoMetadataResponse(error: unknown) {
  console.error("[media] Failed to read video metadata", error);
  return NextResponse.json(
    {
      error: "動画メタデータを取得できませんでした",
      code: "video_metadata_unavailable",
    },
    { status: 400 },
  );
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const items = await db
    .select({
      id: mediaItems.id,
      boardId: mediaItems.boardId,
      type: mediaItems.type,
      filePath: mediaItems.filePath,
      width: mediaItems.width,
      height: mediaItems.height,
      displayOrder: mediaItems.displayOrder,
      duration: mediaItems.duration,
      playbackMode: mediaItems.playbackMode,
      createdAt: mediaItems.createdAt,
      updatedAt: mediaItems.updatedAt,
      boardName: boards.name,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(eq(boards.ownerUserId, resolveOwnerUserId(session.user)))
    .orderBy(asc(mediaItems.displayOrder));
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  const uploadRateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "upload",
      clientIp: resolveRateLimitClientIp(request),
      subject: ownerUserId,
    }),
    windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
    maxAttempts: UPLOAD_RATE_LIMIT_MAX,
  });
  if (uploadRateLimit.limited) {
    return NextResponse.json(
      { error: "アップロード回数の上限に達しました", code: "upload_rate_limited" },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const poster = formData.get("poster");
  const boardId = formData.get("boardId");
  const duration = formData.get("duration");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (!boardId || typeof boardId !== "string") {
    return NextResponse.json(
      { error: "boardId is required" },
      { status: 400 },
    );
  }

  // Validate board exists
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  if (board.ownerUserId !== resolveOwnerUserId(session.user)) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  // Validate file type
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM`,
      },
      { status: 400 },
    );
  }
  const fileNameValidation = validateUploadFilename({
    fileName: file.name,
    contentType: file.type,
  });
  if (!fileNameValidation.ok) {
    return NextResponse.json(
      { error: fileNameValidation.error, code: "invalid_file_extension" },
      { status: 400 },
    );
  }

  // Determine media type
  const mediaType = mediaTypeFromContentType(file.type);
  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }
  try {
    await assertCanUploadMedia({
      ownerUserId,
      mediaType,
      fileSize: file.size,
    });
  } catch (error) {
    const response = planLimitResponse(error);
    if (response) return response;
    throw error;
  }

  // Generate owner/board scoped storage key.
  const sanitizedExt = fileNameValidation.extension;
  const mediaId = randomUUID();
  const storageKey = scopedMediaStorageKey({
    ownerUserId: board.ownerUserId,
    boardId,
    mediaId,
    extension: sanitizedExt,
  });

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let mediaWidth: number | null = null;
  let mediaHeight: number | null = null;

  if (mediaType === "image") {
    // Read the max long edge setting
    const maxSetting = await getOwnerSetting(board.ownerUserId, "imageMaxLongEdge");
    const ownerMaxLongEdge = maxSetting
      ? parseInt(maxSetting, 10)
      : DEFAULT_IMAGE_MAX_LONG_EDGE;
    const maxLongEdge = await getEffectiveImageMaxLongEdge(
      board.ownerUserId,
      ownerMaxLongEdge,
    );

    if (sanitizedExt.toLowerCase() === ".gif") {
      try {
        await assertImageResolutionAllowed({
          ownerUserId: board.ownerUserId,
          longEdge: await getImageLongEdge(buffer),
        });
      } catch (error) {
        const response = planLimitResponse(error);
        if (response) return response;
        throw error;
      }
    }
    buffer = Buffer.from(await resizeImage(buffer, sanitizedExt, maxLongEdge));
    const dimensions = await getImageDimensions(buffer);
    mediaWidth = dimensions.width;
    mediaHeight = dimensions.height;
  }

  if (mediaType === "video") {
    let metadata;
    try {
      metadata = await probeVideoMetadataFromBuffer(buffer, sanitizedExt);
    } catch (error) {
      return videoMetadataResponse(error);
    }

    try {
      await assertVideoResolutionAllowed({
        ownerUserId: board.ownerUserId,
        width: metadata.width,
        height: metadata.height,
      });
    } catch (error) {
      const response = planLimitResponse(error);
      if (response) return response;
      throw error;
    }
    mediaWidth = metadata.width;
    mediaHeight = metadata.height;
  }

  let thumbnail =
    mediaType === "image" ? await generateThumbnail(buffer, path.basename(storageKey)) : null;

  if (mediaType === "video" && poster instanceof File && poster.size > 0) {
    if (!(ALLOWED_VIDEO_POSTER_TYPES as readonly string[]).includes(poster.type)) {
      return NextResponse.json(
        { error: "Unsupported poster image type" },
        { status: 400 },
      );
    }
    const posterNameValidation = validateUploadFilename({
      fileName: poster.name,
      contentType: poster.type,
    });
    if (!posterNameValidation.ok) {
      return NextResponse.json(
        { error: posterNameValidation.error, code: "invalid_poster_extension" },
        { status: 400 },
      );
    }

    const posterBuffer = Buffer.from(await poster.arrayBuffer());
    thumbnail = await generateThumbnail(posterBuffer, "poster.jpg");
  }

  try {
    await assertCanUploadMedia({
      ownerUserId,
      mediaType,
      fileSize: file.size,
      additionalStorageBytes: buffer.length + (thumbnail?.buffer.length ?? 0),
    });
  } catch (error) {
    const response = planLimitResponse(error);
    if (response) return response;
    throw error;
  }

  await writeStoredObject(storageKey, buffer, file.type);
  if (thumbnail) {
    await writeStoredObject(
      thumbnailStorageKeyFromStorageKey(storageKey),
      thumbnail.buffer,
      thumbnail.contentType,
    );
  }

  // Calculate display order (append at end)
  const existing = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.boardId, boardId));
  const maxOrder = existing.reduce(
    (max, item) => Math.max(max, item.displayOrder),
    -1,
  );

  const durationValue =
    duration && typeof duration === "string"
      ? clampMediaDuration(duration)
      : DEFAULT_MEDIA_DURATION_SECONDS;

  const [created] = await db
    .insert(mediaItems)
    .values({
      boardId,
      type: mediaType,
      filePath: publicPathForStorageKey(storageKey),
      fileSizeBytes: buffer.length,
      thumbnailSizeBytes: thumbnail?.buffer.length ?? 0,
      width: mediaWidth,
      height: mediaHeight,
      displayOrder: maxOrder + 1,
      duration: durationValue,
      playbackMode: "duration",
    })
    .returning();

  emitSSE(boardId, "media-updated");

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
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

  const result = updateMediaOrderSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const updates = result.data;
  const updated: unknown[] = [];
  const ownerUserId = resolveOwnerUserId(session.user);

  const boardIds = new Set<string>();
  for (const item of updates) {
    const scopedItem = await db
      .select({
        id: mediaItems.id,
        boardId: mediaItems.boardId,
      })
      .from(mediaItems)
      .innerJoin(boards, eq(mediaItems.boardId, boards.id))
      .where(and(eq(mediaItems.id, item.id), eq(boards.ownerUserId, ownerUserId)))
      .limit(1);

    if (scopedItem.length === 0) {
      return NextResponse.json({ error: "Media item not found" }, { status: 404 });
    }

    const [row] = await db
      .update(mediaItems)
      .set({ displayOrder: item.displayOrder })
      .where(eq(mediaItems.id, item.id))
      .returning();
    if (row) {
      updated.push(row);
      boardIds.add((row as { boardId: string }).boardId);
    }
  }

  for (const boardId of boardIds) {
    emitSSE(boardId, "media-updated");
  }

  return NextResponse.json(updated);
}

export async function DELETE() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  const items = await db
    .select({
      id: mediaItems.id,
      boardId: mediaItems.boardId,
      filePath: mediaItems.filePath,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(eq(boards.ownerUserId, ownerUserId));

  const boardIds = new Set<string>();
  for (const item of items) {
    boardIds.add(item.boardId);
    try {
      await deleteStoredObject(storageKeyFromPublicPath(item.filePath));
    } catch {
      // continue even if file deletion fails
    }
    try {
      await deleteStoredObject(thumbnailStorageKeyFromPublicPath(item.filePath));
    } catch {
      // continue even if thumbnail deletion fails
    }
  }

  if (items.length > 0) {
    await db
      .delete(mediaItems)
      .where(inArray(mediaItems.id, items.map((item) => item.id)));
  }

  for (const boardId of boardIds) {
    emitSSE(boardId, "media-updated");
  }

  return NextResponse.json({ success: true, deleted: items.length });
}
