// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { getOwnerSubscription } from "@/lib/billing";
import { resolveOwnerUserId } from "@/lib/ownership";
import { buildPublicAppUrl } from "@/lib/public-origin";
import { getBillingConfig } from "@/lib/plans";
import {
  StripeBillingError,
  createStripePortalSession,
} from "@/lib/stripe-billing";

function errorResponse(error: unknown) {
  if (error instanceof StripeBillingError) {
    console.error("[billing/portal] Stripe request failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return NextResponse.json({ error: "決済連携に失敗しました", code: error.code }, { status: error.status });
  }

  console.error("[billing/portal] Failed to create portal session", error);
  return NextResponse.json(
    { error: "支払い管理セッションの作成に失敗しました", code: "portal_session_failed" },
    { status: 500 },
  );
}

export async function POST() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const { billingMode } = getBillingConfig();
  if (billingMode !== "stripe") {
    return NextResponse.json(
      { error: "課金機能は無効です", code: "billing_disabled" },
      { status: 403 },
    );
  }

  const returnUrl = buildPublicAppUrl("/billing?billing=portal-return");
  if (!returnUrl) {
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です", code: "public_origin_not_configured" },
      { status: 503 },
    );
  }

  try {
    const ownerUserId = resolveOwnerUserId(session.user);
    const subscription = await getOwnerSubscription(ownerUserId);
    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "決済用の顧客情報が未作成です", code: "stripe_customer_not_found" },
        { status: 404 },
      );
    }

    const url = await createStripePortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl,
    });

    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error);
  }
}
