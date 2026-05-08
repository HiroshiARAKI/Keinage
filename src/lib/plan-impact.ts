// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { MessageKey } from "@/lib/i18n";
import type { OwnerUsage } from "@/lib/owner-usage";
import type { PlanDefinition } from "@/lib/plans";

export type PlanImpactCode =
  | "boards"
  | "images"
  | "storage"
  | "video_disabled"
  | "video_resolution"
  | "max_upload";

export interface PlanImpact {
  code: PlanImpactCode;
  labelKey: MessageKey;
  guidanceKey: MessageKey;
  used: number;
  limit: number | boolean;
  severity: "warning" | "over";
}

export function getVideoResolutionOverLimitCount(
  usage: OwnerUsage,
  maxResolution: number | null,
): number {
  if (maxResolution === null) return 0;
  return maxResolution <= 1920 ? usage.videosOverFhd : usage.videosOver4k;
}

export function buildPlanImpacts(input: {
  usage: OwnerUsage;
  plan: PlanDefinition;
  boardUsage?: "active" | "total";
}): PlanImpact[] {
  const { usage, plan } = input;
  const boardUsage = input.boardUsage ?? "active";
  const boardCount = boardUsage === "total" ? usage.totalBoards : usage.boards;
  const impacts: PlanImpact[] = [];

  if (plan.limits.boards !== null && boardCount > plan.limits.boards) {
    impacts.push({
      code: "boards",
      labelKey: "billing.impact.boards",
      guidanceKey: "billing.impact.guidance.boards",
      used: boardCount,
      limit: plan.limits.boards,
      severity: "over",
    });
  }

  if (plan.limits.images !== null && usage.images > plan.limits.images) {
    impacts.push({
      code: "images",
      labelKey: "billing.impact.images",
      guidanceKey: "billing.impact.guidance.images",
      used: usage.images,
      limit: plan.limits.images,
      severity: "over",
    });
  }

  if (plan.limits.storageBytes !== null && usage.storageBytes > plan.limits.storageBytes) {
    impacts.push({
      code: "storage",
      labelKey: "billing.impact.storage",
      guidanceKey: "billing.impact.guidance.storage",
      used: usage.storageBytes,
      limit: plan.limits.storageBytes,
      severity: "over",
    });
  }

  if (!plan.limits.videoEnabled && usage.videos > 0) {
    impacts.push({
      code: "video_disabled",
      labelKey: "billing.impact.videoDisabled",
      guidanceKey: "billing.impact.guidance.videoDisabled",
      used: usage.videos,
      limit: false,
      severity: "warning",
    });
  }

  const overResolutionVideos = getVideoResolutionOverLimitCount(
    usage,
    plan.limits.maxResolution,
  );
  if (overResolutionVideos > 0) {
    impacts.push({
      code: "video_resolution",
      labelKey: "billing.impact.videoResolution",
      guidanceKey: "billing.impact.guidance.videoResolution",
      used: overResolutionVideos,
      limit: plan.limits.maxResolution ?? 0,
      severity: "warning",
    });
  }

  if (
    plan.limits.maxUploadBytes !== null
    && usage.maxMediaFileSizeBytes > plan.limits.maxUploadBytes
  ) {
    impacts.push({
      code: "max_upload",
      labelKey: "billing.impact.maxUpload",
      guidanceKey: "billing.impact.guidance.maxUpload",
      used: usage.maxMediaFileSizeBytes,
      limit: plan.limits.maxUploadBytes,
      severity: "warning",
    });
  }

  return impacts;
}
