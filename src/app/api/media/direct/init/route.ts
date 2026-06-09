// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boards, directUploadSessions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  createPresignedPutObjectUrl,
  mediaStorageDriver,
  scopedMediaStorageKey,
  thumbnailStorageKeyFromStorageKey,
} from "@/lib/media-storage";
import {
  ALLOWED_VIDEO_POSTER_TYPES,
  mediaTypeFromContentType,
  validateUploadFilename,
} from "@/lib/media-upload";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  assertCanUploadMedia,
  assertImageResolutionAllowed,
  assertVideoResolutionAllowed,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";
import { assertCanAddBoardMedia } from "@/lib/board-media-plan";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const DIRECT_UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DIRECT_UPLOAD_RATE_LIMIT_MAX = 120;
const DIRECT_UPLOAD_COMPLETION_GRACE_MS = 60 * 60 * 1000;

const directUploadInitSchema = z.object({
  boardId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  poster: z.object({
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

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("[media/direct/init] Failed to initialize direct upload", error);
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

  const result = directUploadInitSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 },
    );
  }

  if (mediaStorageDriver() !== "s3") {
    return NextResponse.json(
      {
        error: "S3 direct upload is not configured",
        code: "direct_upload_unavailable",
      },
      { status: 409 },
    );
  }

  const {
    boardId,
    fileName,
    contentType,
    sizeBytes,
    width,
    height,
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
    windowMs: DIRECT_UPLOAD_RATE_LIMIT_WINDOW_MS,
    maxAttempts: DIRECT_UPLOAD_RATE_LIMIT_MAX,
  });
  if (uploadRateLimit.limited) {
    return NextResponse.json(
      { error: "アップロード回数の上限に達しました", code: "upload_rate_limited" },
      { status: 429 },
    );
  }

  try {
    await assertCanUploadMedia({
      ownerUserId,
      mediaType,
      fileSize: sizeBytes,
    });
    await assertCanAddBoardMedia({
      ownerUserId,
      boardId,
      templateId: board.templateId,
      mediaType,
      requireVideoDuration: false,
    });

    if (mediaType === "image" && width && height) {
      await assertImageResolutionAllowed({
        ownerUserId,
        longEdge: Math.max(width, height),
      });
    }

    if (mediaType === "video") {
      if (!width || !height) {
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
        width,
        height,
      });
    }

    await assertCanUploadMedia({
      ownerUserId,
      mediaType,
      fileSize: sizeBytes,
      additionalStorageBytes: sizeBytes + (poster?.sizeBytes ?? 0),
    });
  } catch (error) {
    const response = planLimitResponse(error);
    if (response) return response;
    throw error;
  }

  if (poster && !(ALLOWED_VIDEO_POSTER_TYPES as readonly string[]).includes(poster.contentType)) {
    return NextResponse.json(
      { error: "Unsupported poster image type" },
      { status: 400 },
    );
  }

  const mediaId = randomUUID();
  const storageKey = scopedMediaStorageKey({
    ownerUserId: board.ownerUserId,
    boardId,
    mediaId,
    extension: fileNameValidation.extension,
  });
  const upload = await createPresignedPutObjectUrl(storageKey, contentType);
  const posterKey = poster
    ? thumbnailStorageKeyFromStorageKey(storageKey)
    : null;
  const posterUpload = poster && posterKey
    ? await createPresignedPutObjectUrl(
        posterKey,
        poster.contentType,
      )
    : null;
  const sessionExpiresAt = new Date(
    Math.max(
      Date.parse(upload.expiresAt),
      posterUpload ? Date.parse(posterUpload.expiresAt) : 0,
    ) + DIRECT_UPLOAD_COMPLETION_GRACE_MS,
  ).toISOString();

  await db.insert(directUploadSessions).values({
    mediaId,
    ownerUserId: board.ownerUserId,
    boardId,
    objectKey: storageKey,
    posterObjectKey: posterKey,
    expiresAt: sessionExpiresAt,
  });

  return NextResponse.json({
    mediaId,
    objectKey: storageKey,
    uploadUrl: upload.uploadUrl,
    expiresAt: upload.expiresAt,
    posterUpload: posterUpload && posterKey
      ? {
          objectKey: posterKey,
          uploadUrl: posterUpload.uploadUrl,
          expiresAt: posterUpload.expiresAt,
        }
      : null,
  });
}
