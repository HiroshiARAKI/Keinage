// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ownerSubscriptions, users } from "@/db/schema";
import { isAccountLocked } from "@/lib/account-security";
import { getBillingConfig, isPlanCode, type PlanCode } from "@/lib/plans";
import { requireSuperOwner, SuperOwnerAuthError } from "@/lib/super-owner";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function resolvePlanCode(
  subscription: Pick<
    typeof ownerSubscriptions.$inferSelect,
    "billingMode" | "planCode" | "status"
  > | undefined,
): PlanCode {
  const { billingMode, planEnforcementMode } = getBillingConfig();
  if (billingMode === "disabled" || planEnforcementMode === "unlimited") {
    return "unlimited";
  }

  if (planEnforcementMode === "local") {
    return isPlanCode(subscription?.planCode) ? subscription.planCode : "free";
  }

  const paidSubscriptionActive =
    subscription?.billingMode === "stripe"
    && ["trialing", "active", "past_due"].includes(subscription.status);
  return paidSubscriptionActive && isPlanCode(subscription.planCode)
    ? subscription.planCode
    : "free";
}

/** GET /api/super-owner/users - list privacy-limited user directory rows */
export async function GET(request: NextRequest) {
  try {
    await requireSuperOwner(request, { auditAction: "user_directory_list" });

    const page = positiveInteger(request.nextUrl.searchParams.get("page"), 1);
    const limit = positiveInteger(
      request.nextUrl.searchParams.get("limit"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const offset = (page - 1) * limit;

    const [[totalRow], userRows, ownerRows, subscriptionRows] = await Promise.all([
      db.select({ value: count() }).from(users),
      db
        .select({
          id: users.id,
          userId: users.userId,
          email: users.email,
          role: users.role,
          attribute: users.attribute,
          organizationName: users.organizationName,
          ownerUserId: users.ownerUserId,
          status: users.status,
          lockedUntil: users.lockedUntil,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt), asc(users.userId))
        .limit(limit)
        .offset(offset),
      db
        .select({
          id: users.id,
          organizationName: users.organizationName,
        })
        .from(users)
        .where(eq(users.attribute, "owner")),
      db
        .select({
          ownerUserId: ownerSubscriptions.ownerUserId,
          billingMode: ownerSubscriptions.billingMode,
          planCode: ownerSubscriptions.planCode,
          status: ownerSubscriptions.status,
        })
        .from(ownerSubscriptions),
    ]);

    const organizationByUserId = new Map(
      ownerRows.map((user) => [user.id, user.organizationName]),
    );
    const subscriptionByOwnerId = new Map(
      subscriptionRows.map((subscription) => [
        subscription.ownerUserId,
        subscription,
      ]),
    );
    const now = new Date().toISOString();

    const directoryUsers = userRows.map((user) => {
      const ownerUserId = user.ownerUserId ?? user.id;
      return {
        userId: user.userId,
        email: user.email,
        role: user.role,
        attribute: user.attribute,
        organizationName:
          user.organizationName
          ?? organizationByUserId.get(ownerUserId)
          ?? null,
        plan: resolvePlanCode(subscriptionByOwnerId.get(ownerUserId)),
        status: isAccountLocked(user.lockedUntil, now) ? "locked" : user.status,
        createdAt: user.createdAt,
      };
    });

    return NextResponse.json({
      users: directoryUsers,
      pagination: {
        page,
        limit,
        total: totalRow.value,
        totalPages: Math.max(1, Math.ceil(totalRow.value / limit)),
      },
    });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
