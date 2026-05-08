// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { MessageKey } from "@/lib/i18n";

export type PlanLimitCode =
  | "plan_limit_board_count"
  | "plan_limit_storage"
  | "plan_limit_image_count"
  | "plan_limit_video_disabled"
  | "plan_limit_resolution"
  | "plan_limit_upload_size"
  | "plan_limit_template_disabled";

export const PLAN_LIMIT_MESSAGE_KEYS = {
  plan_limit_board_count: "planLimit.boardCount",
  plan_limit_storage: "planLimit.storage",
  plan_limit_image_count: "planLimit.imageCount",
  plan_limit_video_disabled: "planLimit.videoDisabled",
  plan_limit_resolution: "planLimit.resolution",
  plan_limit_upload_size: "planLimit.uploadSize",
  plan_limit_template_disabled: "planLimit.templateDisabled",
} as const satisfies Record<PlanLimitCode, MessageKey>;

export function isPlanLimitCode(value: string | null | undefined): value is PlanLimitCode {
  return typeof value === "string" && value in PLAN_LIMIT_MESSAGE_KEYS;
}

export function planLimitMessageKey(
  code: string | null | undefined,
  fallbackKey?: string | null,
): MessageKey | null {
  if (isPlanLimitCode(code)) return PLAN_LIMIT_MESSAGE_KEYS[code];
  return fallbackKey?.startsWith("planLimit.")
    ? fallbackKey as MessageKey
    : null;
}
