// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/plans";
import {
  StripeWebhookError,
  handleStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/stripe-webhook";

export const runtime = "nodejs";

function webhookErrorResponse(error: unknown) {
  if (error instanceof StripeWebhookError) {
    console.error("[billing/webhook] Webhook rejected", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return NextResponse.json({ error: error.code }, { status: error.status });
  }

  console.error("[billing/webhook] Webhook processing failed", error);
  return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const { billingMode, stripeWebhookSecret } = getBillingConfig();
  if (billingMode !== "stripe") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();
  try {
    verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      webhookSecret: stripeWebhookSecret,
    });

    const result = await handleStripeWebhookEvent({ rawBody });
    return NextResponse.json(result);
  } catch (error) {
    return webhookErrorResponse(error);
  }
}
