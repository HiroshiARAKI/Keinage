// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { getEffectivePlanForUser } from "@/lib/billing";
import { getOwnerUsage } from "@/lib/owner-usage";

/** GET /api/billing/plan — return the current owner billing/plan foundation state */
export async function GET() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const effectivePlan = await getEffectivePlanForUser(session.user);
  const usage = await getOwnerUsage(effectivePlan.ownerUserId);

  return NextResponse.json({
    ownerUserId: effectivePlan.ownerUserId,
    billingMode: effectivePlan.billingMode,
    planEnforcementMode: effectivePlan.planEnforcementMode,
    plan: effectivePlan.plan,
    subscription: effectivePlan.subscription,
    usage,
  });
}
