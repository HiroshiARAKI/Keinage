// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, messages } from "@/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getBoardDisplayAccessDecision } from "@/lib/board-display-authorization";
import { isBoardDisplayable } from "@/lib/board-status";

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

  const now = new Date().toISOString();
  const activeMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.boardId, id),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, now)),
      ),
    );

  return NextResponse.json(activeMessages);
}
