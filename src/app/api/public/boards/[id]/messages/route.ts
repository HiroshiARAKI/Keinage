// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, messages } from "@/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import { isInOwnerScope } from "@/lib/ownership";

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
