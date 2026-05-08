// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardDisplayDevices, boards } from "@/db/schema";
import { getEffectivePlanForOwner, type EffectivePlan } from "@/lib/billing";

export const BOARD_DEVICE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const BOARD_DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const DEVICE_KEY_MAX_LENGTH = 128;
const USER_AGENT_MAX_LENGTH = 500;

type BoardDeviceBoard = Pick<typeof boards.$inferSelect, "id" | "ownerUserId">;

export interface BoardDeviceStatus {
  id: string;
  boardId: string;
  boardName: string;
  userAgent: string | null;
  lastSeenAt: string;
  online: boolean;
}

export function canUseBoardDeviceStatus(effectivePlan: EffectivePlan): boolean {
  return effectivePlan.plan.limits.deviceStatusMonitoring;
}

export function normalizeBoardDeviceKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > DEVICE_KEY_MAX_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeUserAgent(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, USER_AGENT_MAX_LENGTH);
}

function isOnline(lastSeenAt: string, nowMs: number): boolean {
  const time = Date.parse(lastSeenAt);
  return Number.isFinite(time) && nowMs - time <= BOARD_DEVICE_ONLINE_THRESHOLD_MS;
}

export async function recordBoardDeviceHeartbeat(input: {
  board: BoardDeviceBoard;
  deviceKey: string;
  userAgent: string | null;
}): Promise<{ enabled: boolean }> {
  const effectivePlan = await getEffectivePlanForOwner(input.board.ownerUserId);
  if (!canUseBoardDeviceStatus(effectivePlan)) {
    return { enabled: false };
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const threshold = new Date(nowMs - BOARD_DEVICE_HEARTBEAT_INTERVAL_MS).toISOString();
  const userAgent = normalizeUserAgent(input.userAgent);

  const existing = await db.query.boardDisplayDevices.findFirst({
    where: and(
      eq(boardDisplayDevices.ownerUserId, input.board.ownerUserId),
      eq(boardDisplayDevices.deviceKey, input.deviceKey),
      eq(boardDisplayDevices.boardId, input.board.id),
    ),
  });

  if (!existing) {
    await db
      .insert(boardDisplayDevices)
      .values({
        ownerUserId: input.board.ownerUserId,
        boardId: input.board.id,
        deviceKey: input.deviceKey,
        userAgent,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [
          boardDisplayDevices.ownerUserId,
          boardDisplayDevices.deviceKey,
          boardDisplayDevices.boardId,
        ],
        set: {
          userAgent,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
    return { enabled: true };
  }

  const shouldUpdate =
    existing.userAgent !== userAgent
    || existing.lastSeenAt < threshold;

  if (!shouldUpdate) {
    return { enabled: true };
  }

  await db
    .update(boardDisplayDevices)
    .set({
      userAgent,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(boardDisplayDevices.id, existing.id));

  return { enabled: true };
}

export async function listBoardDeviceStatuses(
  ownerUserId: string,
): Promise<BoardDeviceStatus[]> {
  const nowMs = Date.now();
  const rows = await db
    .select({
      id: boardDisplayDevices.id,
      boardId: boardDisplayDevices.boardId,
      boardName: boards.name,
      userAgent: boardDisplayDevices.userAgent,
      lastSeenAt: boardDisplayDevices.lastSeenAt,
    })
    .from(boardDisplayDevices)
    .innerJoin(boards, eq(boardDisplayDevices.boardId, boards.id))
    .where(eq(boardDisplayDevices.ownerUserId, ownerUserId))
    .orderBy(desc(boardDisplayDevices.lastSeenAt));

  return rows.map((row) => ({
    ...row,
    online: isOnline(row.lastSeenAt, nowMs),
  }));
}
