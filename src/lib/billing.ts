// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerSubscriptions, type users } from "@/db/schema";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  getBillingConfig,
  getPlanDefinition,
  isBillingInterval,
  isBillingMode,
  isPlanCode,
  isSubscriptionStatus,
  type BillingInterval,
  type BillingMode,
  type PlanCode,
  type PlanEnforcementMode,
  type SubscriptionStatus,
} from "@/lib/plans";

type UserLike = Pick<typeof users.$inferSelect, "id" | "attribute" | "ownerUserId">;

function parsePendingActiveBoardIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

export interface OwnerSubscriptionState {
  id: string;
  ownerUserId: string;
  billingMode: BillingMode;
  planCode: PlanCode;
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  deletedOwnerAt: string | null;
  pendingPlanCode: PlanCode | null;
  pendingBillingInterval: BillingInterval | null;
  pendingPlanEffectiveAt: string | null;
  pendingActiveBoardIds: string[];
}

export interface EffectivePlan {
  ownerUserId: string;
  billingMode: BillingMode;
  planEnforcementMode: PlanEnforcementMode;
  plan: ReturnType<typeof getPlanDefinition>;
  subscription: OwnerSubscriptionState | null;
}

function normalizeSubscription(
  row: typeof ownerSubscriptions.$inferSelect,
): OwnerSubscriptionState {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    billingMode: isBillingMode(row.billingMode) ? row.billingMode : "disabled",
    planCode: isPlanCode(row.planCode) ? row.planCode : "free",
    billingInterval: isBillingInterval(row.billingInterval) ? row.billingInterval : null,
    status: isSubscriptionStatus(row.status) ? row.status : "none",
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    deletedOwnerAt: row.deletedOwnerAt,
    pendingPlanCode: isPlanCode(row.pendingPlanCode) ? row.pendingPlanCode : null,
    pendingBillingInterval: isBillingInterval(row.pendingBillingInterval)
      ? row.pendingBillingInterval
      : null,
    pendingPlanEffectiveAt: row.pendingPlanEffectiveAt,
    pendingActiveBoardIds: parsePendingActiveBoardIds(row.pendingActiveBoardIds),
  };
}

export async function getOwnerSubscription(
  ownerUserId: string,
): Promise<OwnerSubscriptionState | null> {
  const row = await db.query.ownerSubscriptions.findFirst({
    where: eq(ownerSubscriptions.ownerUserId, ownerUserId),
  });

  return row ? normalizeSubscription(row) : null;
}

export async function getEffectivePlanForOwner(ownerUserId: string): Promise<EffectivePlan> {
  const { billingMode, planEnforcementMode } = getBillingConfig();
  const subscription = await getOwnerSubscription(ownerUserId);

  if (billingMode === "disabled" || planEnforcementMode === "unlimited") {
    return {
      ownerUserId,
      billingMode,
      planEnforcementMode,
      plan: getPlanDefinition("unlimited"),
      subscription,
    };
  }

  if (planEnforcementMode === "local") {
    const planCode = subscription?.planCode ?? "free";
    return {
      ownerUserId,
      billingMode,
      planEnforcementMode,
      plan: getPlanDefinition(planCode),
      subscription,
    };
  }

  const paidSubscriptionActive =
    subscription?.billingMode === "stripe" &&
    ["trialing", "active", "past_due"].includes(subscription.status);
  const planCode = paidSubscriptionActive ? subscription.planCode : "free";

  return {
    ownerUserId,
    billingMode,
    planEnforcementMode,
    plan: getPlanDefinition(planCode),
    subscription,
  };
}

export async function getEffectivePlanForUser(user: UserLike): Promise<EffectivePlan> {
  return getEffectivePlanForOwner(resolveOwnerUserId(user));
}

export async function saveOwnerStripeCustomer(params: {
  ownerUserId: string;
  stripeCustomerId: string;
}): Promise<OwnerSubscriptionState> {
  const existing = await db.query.ownerSubscriptions.findFirst({
    where: eq(ownerSubscriptions.ownerUserId, params.ownerUserId),
  });

  if (existing) {
    const [updated] = await db
      .update(ownerSubscriptions)
      .set({
        billingMode: "stripe",
        stripeCustomerId: params.stripeCustomerId,
      })
      .where(eq(ownerSubscriptions.ownerUserId, params.ownerUserId))
      .returning();

    return normalizeSubscription(updated);
  }

  const [created] = await db
    .insert(ownerSubscriptions)
    .values({
      ownerUserId: params.ownerUserId,
      billingMode: "stripe",
      stripeCustomerId: params.stripeCustomerId,
    })
    .returning();

  return normalizeSubscription(created);
}
