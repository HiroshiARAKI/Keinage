// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import {
  applyPlanBoardSelection,
  getPlanBoardSelectionState,
  savePendingPlanBoardSelection,
} from "@/lib/plan-board-selection";
import { resolveOwnerUserId } from "@/lib/ownership";

function readSelectedBoardIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>).selectedBoardIds;
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function GET() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  return NextResponse.json(
    await getPlanBoardSelectionState(resolveOwnerUserId(session.user)),
  );
}

export async function POST(request: NextRequest) {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const selectedBoardIds = readSelectedBoardIds(body);
  if (!selectedBoardIds) {
    return NextResponse.json({ error: "selectedBoardIds is required" }, { status: 400 });
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  const state = await getPlanBoardSelectionState(ownerUserId);
  if (state.limit !== null && selectedBoardIds.length > state.limit) {
    return NextResponse.json(
      { error: "selection_limit_exceeded", limit: state.limit },
      { status: 400 },
    );
  }

  try {
    const savedIds =
      state.selectionMode === "pending"
        ? await savePendingPlanBoardSelection({ ownerUserId, selectedBoardIds })
        : await applyPlanBoardSelection({
            ownerUserId,
            selectedBoardIds,
            limit: state.limit,
          });

    return NextResponse.json({
      success: true,
      selectedBoardIds: savedIds,
      state: await getPlanBoardSelectionState(ownerUserId),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "selection_limit_exceeded") {
      return NextResponse.json(
        { error: "selection_limit_exceeded", limit: state.limit },
        { status: 400 },
      );
    }
    throw error;
  }
}
