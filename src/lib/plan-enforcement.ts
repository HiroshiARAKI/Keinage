// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getEffectivePlanForOwner } from "@/lib/billing";
import type { MessageKey } from "@/lib/i18n";
import { getOwnerBoardCount, getOwnerUsage, type OwnerUsage } from "@/lib/owner-usage";
import { PLAN_LIMIT_MESSAGE_KEYS, type PlanLimitCode } from "@/lib/plan-limit";
import type { PlanCode, PlanDefinition } from "@/lib/plans";

export const EXTENDED_TEMPLATE_IDS = [
  "clinic-hours",
  "restaurant-menu",
  "qr-info",
] as const;

export type OwnerPlanUsage = OwnerUsage;
export { getOwnerBoardCount, getOwnerUsage };
export const getOwnerPlanUsage = getOwnerUsage;

export class PlanLimitError extends Error {
  constructor(
    readonly code: PlanLimitCode,
    readonly messageKey: MessageKey,
    readonly details: {
      planCode: PlanCode;
      limit: number | boolean | null;
      usage?: number;
      width?: number;
      height?: number;
    },
  ) {
    super(code);
  }
}

function readUploadMaxBytes(): number | null {
  const raw = process.env.UPLOAD_MAX_BYTES?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function uploadMaxBytesForPlan(plan: PlanDefinition): number | null {
  return plan.limits.maxUploadBytes ?? readUploadMaxBytes();
}

function throwLimit(
  code: PlanLimitCode,
  plan: PlanDefinition,
  limit: number | boolean | null,
  usage?: number,
  dimensions?: { width: number; height: number },
): never {
  throw new PlanLimitError(code, PLAN_LIMIT_MESSAGE_KEYS[code], {
    planCode: plan.code,
    limit,
    usage,
    width: dimensions?.width,
    height: dimensions?.height,
  });
}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError;
}

export function planLimitErrorBody(error: PlanLimitError) {
  return {
    error: error.code,
    code: error.code,
    messageKey: error.messageKey,
    planCode: error.details.planCode,
    limit: error.details.limit,
    usage: error.details.usage,
    width: error.details.width,
    height: error.details.height,
    upgradeRequired: true,
  };
}

export async function assertCanCreateBoard(ownerUserId: string) {
  const effectivePlan = await getEffectivePlanForOwner(ownerUserId);
  const limit = effectivePlan.plan.limits.boards;
  if (limit === null) return effectivePlan;

  const boardCount = await getOwnerBoardCount(ownerUserId);
  if (boardCount >= limit) {
    throwLimit("plan_limit_board_count", effectivePlan.plan, limit, boardCount);
  }

  return effectivePlan;
}

export function isExtendedTemplateId(templateId: string): boolean {
  return EXTENDED_TEMPLATE_IDS.includes(templateId as (typeof EXTENDED_TEMPLATE_IDS)[number]);
}

export async function assertCanUseTemplate(input: {
  ownerUserId: string;
  templateId: string;
}) {
  const effectivePlan = await getEffectivePlanForOwner(input.ownerUserId);
  if (
    isExtendedTemplateId(input.templateId)
    && !effectivePlan.plan.limits.extendedTemplates
  ) {
    throwLimit(
      "plan_limit_template_disabled",
      effectivePlan.plan,
      true,
    );
  }

  return effectivePlan;
}

export async function assertCanUploadMedia(input: {
  ownerUserId: string;
  mediaType: "image" | "video";
  fileSize: number;
  additionalStorageBytes?: number;
}) {
  const effectivePlan = await getEffectivePlanForOwner(input.ownerUserId);
  const { plan } = effectivePlan;
  const uploadLimit = uploadMaxBytesForPlan(plan);
  if (uploadLimit !== null && input.fileSize > uploadLimit) {
    throwLimit("plan_limit_upload_size", plan, uploadLimit, input.fileSize);
  }

  if (input.mediaType === "video" && !plan.limits.videoEnabled) {
    throwLimit("plan_limit_video_disabled", plan, false);
  }

  const needsUsage =
    plan.limits.images !== null
    || (plan.limits.storageBytes !== null && input.additionalStorageBytes !== undefined);
  if (!needsUsage) return effectivePlan;

  const usage = await getOwnerUsage(input.ownerUserId);
  if (
    input.mediaType === "image"
    && plan.limits.images !== null
    && usage.images >= plan.limits.images
  ) {
    throwLimit("plan_limit_image_count", plan, plan.limits.images, usage.images);
  }

  if (
    plan.limits.storageBytes !== null
    && input.additionalStorageBytes !== undefined
    && usage.storageBytes + input.additionalStorageBytes > plan.limits.storageBytes
  ) {
    throwLimit(
      "plan_limit_storage",
      plan,
      plan.limits.storageBytes,
      usage.storageBytes + input.additionalStorageBytes,
    );
  }

  return effectivePlan;
}

export async function getEffectiveImageMaxLongEdge(
  ownerUserId: string,
  ownerSettingMaxLongEdge: number,
) {
  const { plan } = await getEffectivePlanForOwner(ownerUserId);
  const planMax = plan.limits.maxResolution;
  if (planMax === null) return ownerSettingMaxLongEdge;
  if (ownerSettingMaxLongEdge <= 0) return planMax;
  return Math.min(ownerSettingMaxLongEdge, planMax);
}

export async function assertCanSetImageMaxLongEdge(input: {
  ownerUserId: string;
  maxLongEdge: number;
}) {
  const { plan } = await getEffectivePlanForOwner(input.ownerUserId);
  const limit = plan.limits.maxResolution;
  if (limit === null) return;
  if (input.maxLongEdge <= 0 || input.maxLongEdge > limit) {
    throwLimit("plan_limit_resolution", plan, limit, input.maxLongEdge);
  }
}

export async function assertImageResolutionAllowed(input: {
  ownerUserId: string;
  longEdge: number;
}) {
  const { plan } = await getEffectivePlanForOwner(input.ownerUserId);
  const limit = plan.limits.maxResolution;
  if (limit !== null && input.longEdge > limit) {
    throwLimit("plan_limit_resolution", plan, limit, input.longEdge);
  }
}

export async function assertVideoResolutionAllowed(input: {
  ownerUserId: string;
  width: number;
  height: number;
}) {
  const { plan } = await getEffectivePlanForOwner(input.ownerUserId);
  const limit = plan.limits.maxResolution;
  if (limit === null) return;

  const longEdge = Math.max(input.width, input.height);
  const shortEdge = Math.min(input.width, input.height);
  const maxShortEdge = limit <= 1920 ? 1080 : 2160;

  if (longEdge > limit || shortEdge > maxShortEdge) {
    throwLimit(
      "plan_limit_resolution",
      plan,
      limit,
      longEdge,
      { width: input.width, height: input.height },
    );
  }
}
