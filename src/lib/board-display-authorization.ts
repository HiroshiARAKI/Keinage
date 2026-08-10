// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { boards } from "@/db/schema";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import {
  BOARD_DISPLAY_DEVICE_COOKIE,
  readBoardDisplayDeviceKeyFromRequest,
} from "@/lib/board-display-access";
import {
  hasRecentBoardDisplayAccess,
  normalizeBoardDeviceKey,
} from "@/lib/board-device-status";
import { isInOwnerScope } from "@/lib/ownership";

type DisplayBoard = Pick<
  typeof boards.$inferSelect,
  "id" | "ownerUserId" | "visibility"
>;

export type BoardDisplayAccessDecision = "allowed" | "unauthorized" | "not-found";

export function resolveBoardDisplayAccessDecision(input: {
  isPublic: boolean;
  hasSession: boolean;
  sessionInOwnerScope: boolean;
  hasRecentDeviceAccess: boolean;
}): BoardDisplayAccessDecision {
  if (
    input.isPublic
    || input.sessionInOwnerScope
    || input.hasRecentDeviceAccess
  ) {
    return "allowed";
  }
  return input.hasSession ? "not-found" : "unauthorized";
}

async function getPrivateBoardDisplayAccessDecision(
  board: DisplayBoard,
  rawDeviceKey: string | null,
): Promise<BoardDisplayAccessDecision> {
  const session = await getSessionUser();
  const sessionInOwnerScope = session
    ? isInOwnerScope(session.user, board.ownerUserId)
    : false;
  const deviceKey = normalizeBoardDeviceKey(
    rawDeviceKey,
  );
  const hasRecentDeviceAccess = sessionInOwnerScope
    ? false
    : await hasRecentBoardDisplayAccess({ board, deviceKey });

  return resolveBoardDisplayAccessDecision({
    isPublic: false,
    hasSession: Boolean(session),
    sessionInOwnerScope,
    hasRecentDeviceAccess,
  });
}

export async function getBoardDisplayAccessDecision(
  request: Request,
  board: DisplayBoard,
): Promise<BoardDisplayAccessDecision> {
  if (board.visibility !== "private") return "allowed";
  return getPrivateBoardDisplayAccessDecision(
    board,
    readBoardDisplayDeviceKeyFromRequest(request),
  );
}

export async function getBoardPageDisplayAccessDecision(
  board: DisplayBoard,
): Promise<BoardDisplayAccessDecision> {
  if (board.visibility !== "private") return "allowed";
  const cookieStore = await cookies();
  return getPrivateBoardDisplayAccessDecision(
    board,
    cookieStore.get(BOARD_DISPLAY_DEVICE_COOKIE)?.value ?? null,
  );
}
