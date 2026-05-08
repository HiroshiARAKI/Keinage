// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const BILLING_MODES = ["disabled", "stripe"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

export const PLAN_ENFORCEMENT_MODES = ["unlimited", "local", "billing"] as const;
export type PlanEnforcementMode = (typeof PLAN_ENFORCEMENT_MODES)[number];

export const PLAN_CODES = [
  "self_hosted",
  "free",
  "lite",
  "standard",
  "standard_plus",
  "unlimited",
] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const PAID_PLAN_CODES = ["lite", "standard", "standard_plus"] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = [
  "none",
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface PlanLimits {
  boards: number | null;
  images: number | null;
  storageBytes: number | null;
  maxResolution: number | null;
  videoEnabled: boolean;
  watermark: boolean;
  maxUploadBytes: number | null;
  scheduling: "none" | "time_weekday" | "full";
  extendedTemplates: boolean;
  menuItemImages: boolean;
  deviceStatusMonitoring: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  limits: PlanLimits;
}

const MB = 1024 ** 2;
const GB = 1024 ** 3;

export const PLAN_DEFINITIONS = {
  self_hosted: {
    code: "self_hosted",
    name: "Self-hosted",
    limits: {
      boards: null,
      images: null,
      storageBytes: null,
      maxResolution: null,
      videoEnabled: true,
      watermark: false,
      maxUploadBytes: null,
      scheduling: "full",
      extendedTemplates: true,
      menuItemImages: true,
      deviceStatusMonitoring: true,
    },
  },
  free: {
    code: "free",
    name: "Free",
    limits: {
      boards: 1,
      images: 3,
      storageBytes: 20 * MB,
      maxResolution: 1920,
      videoEnabled: false,
      watermark: true,
      maxUploadBytes: 5 * MB,
      scheduling: "none",
      extendedTemplates: false,
      menuItemImages: false,
      deviceStatusMonitoring: false,
    },
  },
  lite: {
    code: "lite",
    name: "Lite",
    limits: {
      boards: 10,
      images: null,
      storageBytes: 1 * GB,
      maxResolution: 1920,
      videoEnabled: true,
      watermark: false,
      maxUploadBytes: 20 * MB,
      scheduling: "time_weekday",
      extendedTemplates: true,
      menuItemImages: false,
      deviceStatusMonitoring: true,
    },
  },
  standard: {
    code: "standard",
    name: "Standard",
    limits: {
      boards: 100,
      images: null,
      storageBytes: 10 * GB,
      maxResolution: 3840,
      videoEnabled: true,
      watermark: false,
      maxUploadBytes: 500 * MB,
      scheduling: "full",
      extendedTemplates: true,
      menuItemImages: true,
      deviceStatusMonitoring: true,
    },
  },
  standard_plus: {
    code: "standard_plus",
    name: "Standard+",
    limits: {
      boards: 300,
      images: null,
      storageBytes: 50 * GB,
      maxResolution: 3840,
      videoEnabled: true,
      watermark: false,
      maxUploadBytes: 2 * GB,
      scheduling: "full",
      extendedTemplates: true,
      menuItemImages: true,
      deviceStatusMonitoring: true,
    },
  },
  unlimited: {
    code: "unlimited",
    name: "Unlimited",
    limits: {
      boards: null,
      images: null,
      storageBytes: null,
      maxResolution: null,
      videoEnabled: true,
      watermark: false,
      maxUploadBytes: null,
      scheduling: "full",
      extendedTemplates: true,
      menuItemImages: true,
      deviceStatusMonitoring: true,
    },
  },
} as const satisfies Record<PlanCode, PlanDefinition>;

export function isBillingMode(value: string | null | undefined): value is BillingMode {
  return BILLING_MODES.includes(value as BillingMode);
}

export function isPlanEnforcementMode(
  value: string | null | undefined,
): value is PlanEnforcementMode {
  return PLAN_ENFORCEMENT_MODES.includes(value as PlanEnforcementMode);
}

export function isPlanCode(value: string | null | undefined): value is PlanCode {
  return PLAN_CODES.includes(value as PlanCode);
}

export function isPaidPlanCode(value: string | null | undefined): value is PaidPlanCode {
  return PAID_PLAN_CODES.includes(value as PaidPlanCode);
}

export function isBillingInterval(
  value: string | null | undefined,
): value is BillingInterval {
  return BILLING_INTERVALS.includes(value as BillingInterval);
}

export function isSubscriptionStatus(
  value: string | null | undefined,
): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus);
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readBillingMode(): BillingMode {
  const value = readEnv("BILLING_MODE");
  return isBillingMode(value) ? value : "disabled";
}

function readPlanEnforcementMode(): PlanEnforcementMode {
  const value = readEnv("PLAN_ENFORCEMENT_MODE");
  return isPlanEnforcementMode(value) ? value : "unlimited";
}

export function getBillingConfig() {
  const billingMode = readBillingMode();
  const planEnforcementMode = readPlanEnforcementMode();

  return {
    billingMode,
    planEnforcementMode,
    stripeSecretKey: readEnv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET"),
    stripePrices: {
      lite: {
        monthly: readEnv("STRIPE_PRICE_LITE_MONTHLY"),
        yearly: readEnv("STRIPE_PRICE_LITE_YEARLY"),
      },
      standard: {
        monthly: readEnv("STRIPE_PRICE_STANDARD_MONTHLY"),
        yearly: readEnv("STRIPE_PRICE_STANDARD_YEARLY"),
      },
      standard_plus: {
        monthly: readEnv("STRIPE_PRICE_STANDARD_PLUS_MONTHLY"),
        yearly: readEnv("STRIPE_PRICE_STANDARD_PLUS_YEARLY"),
      },
    },
  } as const;
}

export function getPlanDefinition(planCode: string | null | undefined): PlanDefinition {
  return PLAN_DEFINITIONS[isPlanCode(planCode) ? planCode : "unlimited"];
}

export function getStripePriceId(
  planCode: PaidPlanCode,
  interval: BillingInterval,
): string | null {
  return getBillingConfig().stripePrices[planCode][interval];
}

export function resolveStripePriceId(
  priceId: string | null | undefined,
): { planCode: PaidPlanCode; interval: BillingInterval } | null {
  if (!priceId) return null;

  const { stripePrices } = getBillingConfig();
  for (const planCode of PAID_PLAN_CODES) {
    for (const interval of BILLING_INTERVALS) {
      if (stripePrices[planCode][interval] === priceId) {
        return { planCode, interval };
      }
    }
  }

  return null;
}
