// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { boards, mediaItems, messages } from "@/db/schema";
import { eq, asc, and, or, isNull, gt } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { publicDeliveryUrlForPublicPath } from "@/lib/media-storage";
import { isInOwnerScope } from "@/lib/ownership";
import { getTemplate } from "@/lib/templates";
import { normalizeConfig } from "@/lib/utils";
import LiveBoard from "@/components/board/LiveBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });

  if (!board || !board.isActive) {
    notFound();
  }

  console.log("[board/page] Access", {
    boardId,
    visibility: board.visibility,
    isActive: board.isActive,
  });

  if (board.visibility === "private") {
    const session = await getSessionUser();
    console.log("[board/page] Private board auth", {
      boardId,
      hasSession: !!session,
    });
    if (!session) {
      redirect(`/pin?redirectTo=${encodeURIComponent(`/${boardId}`)}`);
    }

    if (!isInOwnerScope(session.user, board.ownerUserId)) {
      notFound();
    }
  }

  const normalizedBoard = normalizeConfig(board);

  const template = getTemplate(normalizedBoard.templateId);
  if (!template) {
    notFound();
  }

  const media = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.boardId, boardId))
    .orderBy(asc(mediaItems.displayOrder));

  const now = new Date().toISOString();
  const activeMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.boardId, boardId),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, now))
      )
    );
  const effectivePlan = await getEffectivePlanForOwner(board.ownerUserId);
  const responseMedia =
    board.visibility === "public"
      ? media.map((item) => ({
          ...item,
          filePath: publicDeliveryUrlForPublicPath(item.filePath),
        }))
      : media;

  return (
    <LiveBoard
      board={normalizedBoard}
      mediaItems={responseMedia}
      messages={activeMessages}
      boardPlan={{
        watermark: effectivePlan.plan.limits.watermark,
        scheduling: effectivePlan.plan.limits.scheduling,
        menuItemImages: effectivePlan.plan.limits.menuItemImages,
      }}
      TemplateComponent={template.component}
    />
  );
}
