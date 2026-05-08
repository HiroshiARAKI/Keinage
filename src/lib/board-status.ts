// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const BOARD_STATUSES = [
  "active",
  "inactive_due_to_plan",
  "archived",
  "deleted",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

type BoardStatusLike = {
  status?: string | null;
  isActive?: boolean | null;
};

export function isBoardStatus(value: string | null | undefined): value is BoardStatus {
  return BOARD_STATUSES.includes(value as BoardStatus);
}

export function normalizeBoardStatus(value: string | null | undefined): BoardStatus {
  return isBoardStatus(value) ? value : "active";
}

export function isBoardAccessible(board: BoardStatusLike): boolean {
  return normalizeBoardStatus(board.status) === "active";
}

export function isBoardDisplayable(board: BoardStatusLike): boolean {
  return board.isActive !== false && isBoardAccessible(board);
}
