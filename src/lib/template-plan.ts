// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { PlanCode, PlanDefinition, PlanLimits } from "@/lib/plans";
import type { TemplateId } from "@/types";

export const EXTENDED_TEMPLATE_IDS = [
  "schedule-board",
  "staff-board",
  "split-view",
  "clinic-hours",
  "restaurant-menu",
  "qr-info",
] as const satisfies readonly TemplateId[];

export const PREMIUM_TEMPLATE_IDS = [
  "floor-guide",
] as const satisfies readonly TemplateId[];

export type TemplateRequiredPlanCode = Extract<PlanCode, "lite" | "standard_plus">;

export const TEMPLATE_REQUIRED_PLAN_NAMES = {
  lite: "Lite",
  standard_plus: "Standard+",
} as const satisfies Record<TemplateRequiredPlanCode, string>;

type TemplatePlanLimits = Pick<PlanLimits, "extendedTemplates" | "premiumTemplates">;

export function isExtendedTemplateId(templateId: string): boolean {
  return EXTENDED_TEMPLATE_IDS.includes(templateId as (typeof EXTENDED_TEMPLATE_IDS)[number]);
}

export function isPremiumTemplateId(templateId: string): boolean {
  return PREMIUM_TEMPLATE_IDS.includes(templateId as (typeof PREMIUM_TEMPLATE_IDS)[number]);
}

export function getTemplateRequiredPlanCode(
  templateId: string,
): TemplateRequiredPlanCode | null {
  if (isPremiumTemplateId(templateId)) return "standard_plus";
  if (isExtendedTemplateId(templateId)) return "lite";
  return null;
}

export function getUnavailableTemplateRequiredPlanCode(
  templateId: string,
  plan: Pick<PlanDefinition, "limits">,
): TemplateRequiredPlanCode | null {
  const limits: TemplatePlanLimits = plan.limits;
  if (isPremiumTemplateId(templateId) && !limits.premiumTemplates) {
    return "standard_plus";
  }

  if (isExtendedTemplateId(templateId) && !limits.extendedTemplates) {
    return "lite";
  }

  return null;
}
