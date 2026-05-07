// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, mediaItems, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { isBoardDisplayable } from "@/lib/board-status";
import { recordBoardViewed } from "@/lib/board-view-tracking";
import { applyMediaPlanRestrictions } from "@/lib/media-plan";
import { publicDeliveryUrlForPublicPath } from "@/lib/media-storage";
import { isInOwnerScope } from "@/lib/ownership";
import { normalizeConfig } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, id),
  });
  if (!board || !isBoardDisplayable(board)) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  if (board.visibility === "private") {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    if (!isInOwnerScope(session.user, board.ownerUserId)) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
  }

  await recordBoardViewed(board);

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
  const planRestrictedMedia = applyMediaPlanRestrictions(media, effectivePlan.plan);
  const responseMedia =
    board.visibility === "public"
      ? planRestrictedMedia.map((item) => ({
          ...item,
          filePath: publicDeliveryUrlForPublicPath(item.filePath),
        }))
      : planRestrictedMedia;

  return NextResponse.json({
    ...normalizeConfig(board),
    boardPlan: {
      watermark: effectivePlan.plan.limits.watermark,
      scheduling: effectivePlan.plan.limits.scheduling,
      menuItemImages: effectivePlan.plan.limits.menuItemImages,
    },
    mediaItems: responseMedia,
    messages: boardMessages,
  });
}
