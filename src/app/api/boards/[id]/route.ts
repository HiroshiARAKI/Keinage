// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, mediaItems, messages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { sanitizeSchedulingConfig } from "@/lib/scheduling";
import {
  assertCanUseTemplate,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";
import { updateBoardSchema } from "@/lib/validators";
import { emitSSE } from "@/lib/sse";
import { findOwnedBoard, resolveOwnerUserId } from "@/lib/ownership";
import { normalizeConfig, parseJsonObject } from "@/lib/utils";

const LEGACY_IMAGE_DURATION_SECONDS = 5;

function readSlideInterval(config: unknown): number | undefined {
  const raw = parseJsonObject(config).slideInterval;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 1 ? raw : undefined;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const board = await findOwnedBoard(id, resolveOwnerUserId(session.user));
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const media = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.boardId, id))
    .orderBy(asc(mediaItems.displayOrder));

  const boardMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.boardId, id));
  const effectivePlan = await getEffectivePlanForOwner(board.ownerUserId);

  return NextResponse.json({
    ...normalizeConfig(board),
    boardPlan: {
      watermark: effectivePlan.plan.limits.watermark,
      scheduling: effectivePlan.plan.limits.scheduling,
      menuItemImages: effectivePlan.plan.limits.menuItemImages,
    },
    mediaItems: media,
    messages: boardMessages,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await findOwnedBoard(id, resolveOwnerUserId(session.user));
  if (!existing) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const normalizedExisting = normalizeConfig(existing);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = updateBoardSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (result.data.name !== undefined) updates.name = result.data.name;
  if (result.data.templateId !== undefined) {
    try {
      await assertCanUseTemplate({
        ownerUserId: existing.ownerUserId,
        templateId: result.data.templateId,
      });
    } catch (error) {
      if (isPlanLimitError(error)) {
        return NextResponse.json(planLimitErrorBody(error), { status: 403 });
      }
      throw error;
    }
    updates.templateId = result.data.templateId;
  }
  if (result.data.visibility !== undefined) updates.visibility = result.data.visibility;
  if (result.data.config !== undefined) {
    const [boardMedia, boardMessages, effectivePlan] = await Promise.all([
      db
        .select({
          id: mediaItems.id,
          type: mediaItems.type,
        })
        .from(mediaItems)
        .where(eq(mediaItems.boardId, id)),
      db
        .select({
          id: messages.id,
        })
        .from(messages)
        .where(eq(messages.boardId, id)),
      getEffectivePlanForOwner(existing.ownerUserId),
    ]);

    updates.config = sanitizeSchedulingConfig({
      config: result.data.config,
      capability: effectivePlan.plan.limits.scheduling,
      mediaIds: new Set(boardMedia.map((item) => item.id)),
      imageIds: new Set(
        boardMedia
          .filter((item) => item.type === "image")
          .map((item) => item.id),
      ),
      messageIds: new Set(boardMessages.map((message) => message.id)),
    });
  }
  if (result.data.isActive !== undefined) updates.isActive = result.data.isActive;

  const previousSlideInterval = readSlideInterval(normalizedExisting.config);
  const nextSlideInterval =
    result.data.config !== undefined
      ? readSlideInterval(result.data.config)
      : undefined;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(normalizedExisting);
  }

  if (updates.config !== undefined) {
    updates.config = JSON.stringify(updates.config);
  }

  const [updated] = await db
    .update(boards)
    .set(updates)
    .where(eq(boards.id, id))
    .returning();

  if (
    nextSlideInterval !== undefined &&
    nextSlideInterval !== previousSlideInterval
  ) {
    const boardMedia = await db
      .select({
        id: mediaItems.id,
        type: mediaItems.type,
        duration: mediaItems.duration,
      })
      .from(mediaItems)
      .where(eq(mediaItems.boardId, id));

    const fallbackDurations = new Set<number>([LEGACY_IMAGE_DURATION_SECONDS]);
    if (previousSlideInterval !== undefined) {
      fallbackDurations.add(previousSlideInterval);
    }

    const imageIdsToSync = boardMedia
      .filter(
        (item) => item.type === "image" && fallbackDurations.has(item.duration),
      )
      .map((item) => item.id);

    for (const mediaId of imageIdsToSync) {
      await db
        .update(mediaItems)
        .set({ duration: nextSlideInterval })
        .where(eq(mediaItems.id, mediaId));
    }

    if (imageIdsToSync.length > 0) {
      emitSSE(id, "media-updated");
    }
  }

  emitSSE(id, "board-updated");

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await findOwnedBoard(id, resolveOwnerUserId(session.user));
  if (!existing) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  await db.delete(boards).where(eq(boards.id, id));

  emitSSE(id, "board-updated");

  return NextResponse.json({ success: true });
}
