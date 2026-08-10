// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, mediaItems, messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getBoardDisplayAccessDecision } from "@/lib/board-display-authorization";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { isBoardDisplayable } from "@/lib/board-status";
import { recordBoardViewed } from "@/lib/board-view-tracking";
import { isCloudFrontSignedDeliveryMode } from "@/lib/cloudfront-signed-url";
import { applyMediaPlanRestrictions } from "@/lib/media-plan";
import { deliveryUrlForMediaItem } from "@/lib/media-storage";
import { resolveSplitViewMediaReferences } from "@/lib/split-view";
import { normalizeConfig } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, id),
  });
  if (!board || !isBoardDisplayable(board)) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const access = await getBoardDisplayAccessDecision(request, board);
  if (access !== "allowed") {
    return NextResponse.json(
      { error: access === "unauthorized" ? "認証が必要です" : "Board not found" },
      { status: access === "unauthorized" ? 401 : 404 },
    );
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
    board.visibility === "public" || isCloudFrontSignedDeliveryMode()
      ? planRestrictedMedia.map((item) => ({
          ...item,
          filePath: deliveryUrlForMediaItem(item),
        }))
      : planRestrictedMedia;
  const normalizedBoard = resolveSplitViewMediaReferences(normalizeConfig(board), media);

  return NextResponse.json({
    ...normalizedBoard,
    boardPlan: {
      watermark: effectivePlan.plan.limits.watermark,
      scheduling: effectivePlan.plan.limits.scheduling,
      menuItemImages: effectivePlan.plan.limits.menuItemImages,
    },
    mediaItems: responseMedia,
    messages: boardMessages,
  });
}
