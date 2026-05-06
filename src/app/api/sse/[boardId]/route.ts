// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest } from "next/server";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import { addClient, removeClient } from "@/lib/sse";
import { isInOwnerScope } from "@/lib/ownership";

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params;

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });

  if (!board || !isBoardDisplayable(board)) {
    return new Response("Board not found", { status: 404 });
  }

  if (board.visibility === "private") {
    const session = await getSessionUser();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!isInOwnerScope(session.user, board.ownerUserId)) {
      return new Response("Board not found", { status: 404 });
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"boardId":"${boardId}"}\n\n`),
      );

      // Register client
      const client = addClient(boardId, controller);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        removeClient(boardId, client);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
