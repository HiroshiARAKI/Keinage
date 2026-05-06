// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, mediaItems } from "@/db/schema";

export interface OwnerUsage {
  boards: number;
  totalBoards: number;
  inactiveDueToPlanBoards: number;
  mediaItems: number;
  images: number;
  videos: number;
  /** Sum of DB media file metadata in bytes. Orphaned storage objects are intentionally excluded. */
  storageBytes: number;
}

function aggregateNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") return Number(value);
  return 0;
}

export async function getOwnerBoardCount(ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(boards)
    .where(and(eq(boards.ownerUserId, ownerUserId), eq(boards.status, "active")));

  return aggregateNumber(row?.count);
}

export async function getOwnerUsage(ownerUserId: string): Promise<OwnerUsage> {
  const [boardCount, boardStatusUsage, mediaUsage] = await Promise.all([
    getOwnerBoardCount(ownerUserId),
    db
      .select({
        totalBoards: count(),
        inactiveDueToPlanBoards: sql<number>`count(*) filter (where ${boards.status} = 'inactive_due_to_plan')`,
      })
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId)),
    db
      .select({
        mediaItems: count(),
        images: sql<number>`count(*) filter (where ${mediaItems.type} = 'image')`,
        videos: sql<number>`count(*) filter (where ${mediaItems.type} = 'video')`,
        storageBytes: sql<number>`coalesce(sum(${mediaItems.fileSizeBytes} + ${mediaItems.thumbnailSizeBytes}), 0)`,
      })
      .from(mediaItems)
      .innerJoin(boards, eq(mediaItems.boardId, boards.id))
      .where(eq(boards.ownerUserId, ownerUserId)),
  ]);

  const [boardStatusRow] = boardStatusUsage;
  const [row] = mediaUsage;
  return {
    boards: boardCount,
    totalBoards: aggregateNumber(boardStatusRow?.totalBoards),
    inactiveDueToPlanBoards: aggregateNumber(boardStatusRow?.inactiveDueToPlanBoards),
    mediaItems: aggregateNumber(row?.mediaItems),
    images: aggregateNumber(row?.images),
    videos: aggregateNumber(row?.videos),
    storageBytes: aggregateNumber(row?.storageBytes),
  };
}
