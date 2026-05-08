// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { boards } from "@/db/schema";

export const LAST_VIEWED_UPDATE_INTERVAL_MS = 10 * 60 * 1000;

type BoardViewLike = Pick<typeof boards.$inferSelect, "id" | "lastViewedAt">;

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function shouldRecordBoardViewed(lastViewedAt: string | null, now = Date.now()): boolean {
  const lastViewedTime = parseTime(lastViewedAt);
  if (lastViewedTime === null) return true;
  return now - lastViewedTime >= LAST_VIEWED_UPDATE_INTERVAL_MS;
}

export async function recordBoardViewed(board: BoardViewLike) {
  const nowMs = Date.now();
  if (!shouldRecordBoardViewed(board.lastViewedAt, nowMs)) return;

  const now = new Date(nowMs).toISOString();
  const threshold = new Date(nowMs - LAST_VIEWED_UPDATE_INTERVAL_MS).toISOString();

  await db
    .update(boards)
    .set({ lastViewedAt: now })
    .where(
      and(
        eq(boards.id, board.id),
        or(isNull(boards.lastViewedAt), lt(boards.lastViewedAt, threshold)),
      ),
    );
}
