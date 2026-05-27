// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import {
  hasRecentBoardDisplayAccess,
  normalizeBoardDeviceKey,
  recordBoardDeviceHeartbeat,
} from "@/lib/board-device-status";
import { recordBoardViewed } from "@/lib/board-view-tracking";
import { isInOwnerScope } from "@/lib/ownership";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const deviceKey = normalizeBoardDeviceKey(
    body && typeof body === "object" ? (body as { deviceKey?: unknown }).deviceKey : null,
  );

  if (!deviceKey) {
    return NextResponse.json({ error: "deviceKey is required" }, { status: 400 });
  }

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, id),
  });

  if (!board || !isBoardDisplayable(board)) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  if (board.visibility === "private") {
    const session = await getSessionUser();
    const sessionAllowed = session
      ? isInOwnerScope(session.user, board.ownerUserId)
      : false;
    const displayAccessAllowed = sessionAllowed
      ? false
      : await hasRecentBoardDisplayAccess({ board, deviceKey });

    if (!sessionAllowed && !displayAccessAllowed) {
      if (!session) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
  }

  await recordBoardViewed(board);
  const result = await recordBoardDeviceHeartbeat({
    board,
    deviceKey,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(result);
}
