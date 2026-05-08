// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAdminSessionUser } from "@/lib/auth";
import {
  getOwnerSubscription,
  saveOwnerStripeCustomer,
} from "@/lib/billing";
import { resolveOwnerUserId } from "@/lib/ownership";
import { buildPublicAppUrl } from "@/lib/public-origin";
import {
  getBillingConfig,
  getStripePriceId,
  isBillingInterval,
  isPaidPlanCode,
} from "@/lib/plans";
import {
  StripeBillingError,
  createStripeCheckoutSession,
  createStripeCustomer,
} from "@/lib/stripe-billing";

function errorResponse(error: unknown) {
  if (error instanceof StripeBillingError) {
    console.error("[billing/checkout] Stripe request failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return NextResponse.json({ error: "決済連携に失敗しました", code: error.code }, { status: error.status });
  }

  console.error("[billing/checkout] Failed to create checkout session", error);
  return NextResponse.json(
    { error: "Checkout セッションの作成に失敗しました", code: "checkout_session_failed" },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const planCode = typeof body.planCode === "string" ? body.planCode : null;
  const interval = typeof body.interval === "string" ? body.interval : null;
  if (!isPaidPlanCode(planCode) || !isBillingInterval(interval)) {
    return NextResponse.json(
      { error: "有料プランと請求間隔を指定してください", code: "invalid_plan_or_interval" },
      { status: 400 },
    );
  }

  const priceId = getStripePriceId(planCode, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: "決済価格 ID が未設定です", code: "stripe_price_not_configured" },
      { status: 503 },
    );
  }

  const successUrl = buildPublicAppUrl("/billing?billing=checkout-success");
  const cancelUrl = buildPublicAppUrl("/billing?billing=checkout-cancelled");
  if (!successUrl || !cancelUrl) {
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です", code: "public_origin_not_configured" },
      { status: 503 },
    );
  }

  try {
    const ownerUserId = resolveOwnerUserId(session.user);
    const owner = await db.query.users.findFirst({
      where: eq(users.id, ownerUserId),
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Ownerユーザーが見つかりません", code: "owner_not_found" },
        { status: 404 },
      );
    }

    const subscription = await getOwnerSubscription(ownerUserId);
    const stripeCustomerId = subscription?.stripeCustomerId
      ?? await createStripeCustomer({
        ownerUserId,
        email: owner.email,
        name: owner.userId,
      });
    if (!subscription?.stripeCustomerId) {
      await saveOwnerStripeCustomer({ ownerUserId, stripeCustomerId });
    }

    const url = await createStripeCheckoutSession({
      ownerUserId,
      customerId: stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error);
  }
}
