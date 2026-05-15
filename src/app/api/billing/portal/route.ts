// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { getOwnerSubscription } from "@/lib/billing";
import { resolveOwnerUserId } from "@/lib/ownership";
import { buildPublicAppUrl } from "@/lib/public-origin";
import { getBillingConfig } from "@/lib/plans";
import {
  StripeBillingError,
  createStripePortalSession,
} from "@/lib/stripe-billing";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import { writeUserAuditLog } from "@/lib/audit-log";

const BILLING_PORTAL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const BILLING_PORTAL_RATE_LIMIT_MAX = 20;

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
  const ownerUserId = resolveOwnerUserId(session.user);
  const billingRateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "billing",
      clientIp: resolveRateLimitClientIp(request),
      subject: ownerUserId,
    }),
    windowMs: BILLING_PORTAL_RATE_LIMIT_WINDOW_MS,
    maxAttempts: BILLING_PORTAL_RATE_LIMIT_MAX,
  });
  if (billingRateLimit.limited) {
    await writeUserAuditLog({
      user: session.user,
      action: "customer_portal_session_created",
      targetType: "billing",
      targetId: ownerUserId,
      result: "denied",
      reason: "rate_limited",
      request,
    });
    return NextResponse.json(
      { error: "決済リクエストの上限に達しました", code: "billing_rate_limited" },
      { status: 429 },
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

    await writeUserAuditLog({
      user: session.user,
      action: "customer_portal_session_created",
      targetType: "billing",
      targetId: ownerUserId,
      result: "success",
      request,
    });
    return NextResponse.json({ url });
  } catch (error) {
    await writeUserAuditLog({
      user: session.user,
      action: "customer_portal_session_created",
      targetType: "billing",
      targetId: ownerUserId,
      result: "failure",
      reason: error instanceof StripeBillingError ? error.code : "portal_session_failed",
      request,
    });
    return errorResponse(error);
  }
}
