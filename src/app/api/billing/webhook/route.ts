// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/plans";
import {
  StripeWebhookError,
  handleStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/stripe-webhook";
import { writeAuditLog } from "@/lib/audit-log";

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

function parseEventSummary(rawBody: string): { id: string | null; type: string | null } {
  try {
    const parsed = JSON.parse(rawBody) as { id?: unknown; type?: unknown };
    return {
      id: typeof parsed.id === "string" ? parsed.id : null,
      type: typeof parsed.type === "string" ? parsed.type : null,
    };
  } catch {
    return { id: null, type: null };
  }
}

async function writeStripeBusinessAudit(input: {
  eventId: string | null;
  eventType: string | null;
  request: NextRequest;
}) {
  const common = {
    actorType: "stripe_webhook" as const,
    targetType: "stripe_event",
    targetId: input.eventId,
    result: "success" as const,
    request: input.request,
    metadata: { stripeEventType: input.eventType },
  };

  switch (input.eventType) {
    case "customer.subscription.created":
      await writeAuditLog({ ...common, action: "subscription_created" });
      break;
    case "customer.subscription.updated":
      await writeAuditLog({ ...common, action: "subscription_updated" });
      await writeAuditLog({ ...common, action: "plan_changed" });
      break;
    case "customer.subscription.deleted":
      await writeAuditLog({ ...common, action: "subscription_canceled" });
      break;
    case "invoice.payment_failed":
      await writeAuditLog({ ...common, action: "payment_failed" });
      break;
    case "invoice.payment_succeeded":
      await writeAuditLog({ ...common, action: "payment_succeeded" });
      break;
    default:
      break;
  }
}

export async function POST(request: NextRequest) {
  const { billingMode, stripeWebhookSecret } = getBillingConfig();
  if (billingMode !== "stripe") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();
  await writeAuditLog({
    actorType: "stripe_webhook",
    action: "stripe_webhook_received",
    targetType: "stripe_event",
    result: "success",
    request,
    metadata: { rawBodyBytes: Buffer.byteLength(rawBody) },
  });
  try {
    verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      webhookSecret: stripeWebhookSecret,
    });

    const eventSummary = parseEventSummary(rawBody);
    const result = await handleStripeWebhookEvent({ rawBody });
    if (result.status === "duplicate") {
      await writeAuditLog({
        actorType: "stripe_webhook",
        action: "stripe_webhook_duplicate_skipped",
        targetType: "stripe_event",
        targetId: result.eventId,
        result: "skipped",
        reason: "duplicate_event",
        request,
        metadata: { stripeEventType: eventSummary.type },
      });
    } else {
      await writeAuditLog({
        actorType: "stripe_webhook",
        action: "stripe_webhook_processed",
        targetType: "stripe_event",
        targetId: result.eventId,
        result: result.status === "processed" ? "success" : "skipped",
        reason: result.status === "ignored" ? "ignored_event" : null,
        request,
        metadata: { stripeEventType: eventSummary.type, status: result.status },
      });
      if (result.status === "processed") {
        await writeStripeBusinessAudit({
          eventId: result.eventId,
          eventType: eventSummary.type,
          request,
        });
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    const eventSummary = parseEventSummary(rawBody);
    await writeAuditLog({
      actorType: "stripe_webhook",
      action: error instanceof StripeWebhookError && error.code.startsWith("signature_")
        ? "stripe_webhook_signature_failed"
        : "stripe_webhook_failed",
      targetType: "stripe_event",
      targetId: eventSummary.id,
      result: "failure",
      reason: error instanceof StripeWebhookError ? error.code : "webhook_processing_failed",
      request,
      metadata: { stripeEventType: eventSummary.type },
    });
    return webhookErrorResponse(error);
  }
}
