// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, ownerSubscriptions } from "@/db/schema";
import { getEffectivePlanForOwner, getOwnerSubscription } from "@/lib/billing";
import { emitSSE } from "@/lib/sse";
import {
  getPlanDefinition,
  isBillingInterval,
  isPlanCode,
  type BillingInterval,
  type PlanCode,
} from "@/lib/plans";
import { normalizeBoardStatus, type BoardStatus } from "@/lib/board-status";

export interface PlanBoardSelectionItem {
  id: string;
  name: string;
  status: BoardStatus;
  isActive: boolean;
  visibility: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
}

export interface PlanBoardSelectionState {
  selectionMode: "current" | "pending";
  selectionPlanCode: PlanCode;
  selectionPlanName: string;
  pendingPlanCode: PlanCode | null;
  pendingPlanName: string | null;
  pendingBillingInterval: BillingInterval | null;
  pendingPlanEffectiveAt: string | null;
  pendingActiveBoardIds: string[];
  limit: number | null;
  currentLimit: number | null;
  totalBoards: number;
  activeBoards: number;
  inactiveDueToPlanBoards: number;
  selectedBoardIds: string[];
  autoSelectedBoardIds: string[];
  boards: PlanBoardSelectionItem[];
}

const BOARD_SELECTION_ORDER = [
  sql`${boards.lastViewedAt} desc nulls last`,
  desc(boards.updatedAt),
  desc(boards.createdAt),
] as const;

export function parsePendingActiveBoardIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

function isFutureOrUnset(value: string | null): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  return !Number.isFinite(time) || time > Date.now();
}

function normalizeBoard(row: typeof boards.$inferSelect): PlanBoardSelectionItem {
  return {
    id: row.id,
    name: row.name,
    status: normalizeBoardStatus(row.status),
    isActive: row.isActive,
    visibility: row.visibility,
    templateId: row.templateId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastViewedAt: row.lastViewedAt,
  };
}

export async function buildDefaultPendingActiveBoardIds(
  ownerUserId: string,
  maxBoards: number | null,
): Promise<string[]> {
  const rows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(
        eq(boards.ownerUserId, ownerUserId),
        eq(boards.status, "active"),
      ),
    )
    .orderBy(...BOARD_SELECTION_ORDER)
    .limit(maxBoards ?? 10_000);

  return rows.map((row) => row.id);
}

async function validOwnedBoardIds(ownerUserId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.ownerUserId, ownerUserId), inArray(boards.id, ids)));
  const owned = new Set(rows.map((row) => row.id));
  return ids.filter((id) => owned.has(id));
}

export async function getPlanBoardSelectionState(
  ownerUserId: string,
): Promise<PlanBoardSelectionState> {
  const [effectivePlan, subscription, ownerBoards] = await Promise.all([
    getEffectivePlanForOwner(ownerUserId),
    getOwnerSubscription(ownerUserId),
    db
      .select()
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId))
      .orderBy(...BOARD_SELECTION_ORDER),
  ]);

  const pendingPlanCode =
    subscription?.pendingPlanCode && isPlanCode(subscription.pendingPlanCode)
      ? subscription.pendingPlanCode
      : null;
  const hasPendingPlan =
    pendingPlanCode !== null && isFutureOrUnset(subscription?.pendingPlanEffectiveAt ?? null);
  const selectionPlanCode = hasPendingPlan ? pendingPlanCode : effectivePlan.plan.code;
  const selectionPlan = getPlanDefinition(selectionPlanCode);
  const currentLimit = effectivePlan.plan.limits.boards;
  const limit = selectionPlan.limits.boards;
  const normalizedBoards = ownerBoards
    .filter((board) => normalizeBoardStatus(board.status) !== "deleted")
    .map(normalizeBoard);
  const activeBoardIds = normalizedBoards
    .filter((board) => board.status === "active")
    .map((board) => board.id);
  const pendingActiveBoardIds = hasPendingPlan
    ? subscription?.pendingActiveBoardIds ?? []
    : [];
  const autoSelectedBoardIds = await buildDefaultPendingActiveBoardIds(ownerUserId, limit);
  const selectedBoardIds =
    hasPendingPlan && pendingActiveBoardIds.length > 0
      ? pendingActiveBoardIds
      : limit === null
        ? activeBoardIds
        : autoSelectedBoardIds.slice(0, limit);

  return {
    selectionMode: hasPendingPlan ? "pending" : "current",
    selectionPlanCode,
    selectionPlanName: selectionPlan.name,
    pendingPlanCode: hasPendingPlan ? pendingPlanCode : null,
    pendingPlanName: hasPendingPlan ? selectionPlan.name : null,
    pendingBillingInterval: isBillingInterval(subscription?.pendingBillingInterval)
      ? subscription.pendingBillingInterval
      : null,
    pendingPlanEffectiveAt: hasPendingPlan ? subscription?.pendingPlanEffectiveAt ?? null : null,
    pendingActiveBoardIds,
    limit,
    currentLimit,
    totalBoards: normalizedBoards.length,
    activeBoards: activeBoardIds.length,
    inactiveDueToPlanBoards: normalizedBoards.filter(
      (board) => board.status === "inactive_due_to_plan",
    ).length,
    selectedBoardIds,
    autoSelectedBoardIds,
    boards: normalizedBoards,
  };
}

export async function savePendingPlanBoardSelection(input: {
  ownerUserId: string;
  selectedBoardIds: string[];
}): Promise<string[]> {
  const subscription = await getOwnerSubscription(input.ownerUserId);
  if (!subscription?.pendingPlanCode || !isPlanCode(subscription.pendingPlanCode)) {
    throw new Error("pending_plan_not_found");
  }

  const limit = getPlanDefinition(subscription.pendingPlanCode).limits.boards;
  const ownedIds = await validOwnedBoardIds(input.ownerUserId, input.selectedBoardIds);
  if (limit !== null && ownedIds.length > limit) {
    throw new Error("selection_limit_exceeded");
  }

  await db
    .update(ownerSubscriptions)
    .set({
      pendingActiveBoardIds: JSON.stringify(ownedIds),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(ownerSubscriptions.ownerUserId, input.ownerUserId));

  return ownedIds;
}

export async function applyPlanBoardSelection(input: {
  ownerUserId: string;
  selectedBoardIds: string[];
  limit: number | null;
}): Promise<string[]> {
  const selectedIds =
    input.limit === null
      ? await validOwnedBoardIds(input.ownerUserId, input.selectedBoardIds)
      : (await validOwnedBoardIds(input.ownerUserId, input.selectedBoardIds)).slice(0, input.limit);
  const activeBefore = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.ownerUserId, input.ownerUserId), eq(boards.status, "active")));
  const affectedBoardIds = new Set([
    ...activeBefore.map((board) => board.id),
    ...selectedIds,
  ]);

  await db
    .update(boards)
    .set({ status: "inactive_due_to_plan", updatedAt: new Date().toISOString() })
    .where(
      selectedIds.length > 0
        ? and(
            eq(boards.ownerUserId, input.ownerUserId),
            notInArray(boards.id, selectedIds),
            eq(boards.status, "active"),
          )
        : and(
            eq(boards.ownerUserId, input.ownerUserId),
            eq(boards.status, "active"),
          ),
    );

  if (selectedIds.length > 0) {
    await db
      .update(boards)
      .set({ status: "active", updatedAt: new Date().toISOString() })
      .where(and(eq(boards.ownerUserId, input.ownerUserId), inArray(boards.id, selectedIds)));
  }

  for (const boardId of affectedBoardIds) {
    emitSSE(boardId, "board-updated");
  }

  return selectedIds;
}

export async function applyPendingPlanBoardSelection(input: {
  ownerUserId: string;
  pendingActiveBoardIds: string[];
  targetPlanCode: PlanCode;
}): Promise<string[]> {
  const limit = getPlanDefinition(input.targetPlanCode).limits.boards;
  if (limit === null) {
    return applyPlanBoardSelection({
      ownerUserId: input.ownerUserId,
      selectedBoardIds: await buildDefaultPendingActiveBoardIds(input.ownerUserId, null),
      limit,
    });
  }

  let selectedIds = await validOwnedBoardIds(
    input.ownerUserId,
    input.pendingActiveBoardIds,
  );
  if (selectedIds.length === 0) {
    selectedIds = await buildDefaultPendingActiveBoardIds(input.ownerUserId, limit);
  }
  selectedIds = selectedIds.slice(0, limit);

  return applyPlanBoardSelection({
    ownerUserId: input.ownerUserId,
    selectedBoardIds: selectedIds,
    limit,
  });
}
