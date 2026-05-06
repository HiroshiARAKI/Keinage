// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHmac, timingSafeEqual } from "crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { ownerSubscriptions, stripeEvents } from "@/db/schema";
import {
  applyPendingPlanBoardSelection,
  buildDefaultPendingActiveBoardIds,
  parsePendingActiveBoardIds,
} from "@/lib/plan-board-selection";
import {
  getPlanDefinition,
  isBillingInterval,
  isPlanCode,
  resolveStripePriceId,
  type BillingInterval,
  type PaidPlanCode,
  type PlanCode,
  type SubscriptionStatus,
} from "@/lib/plans";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

export class StripeWebhookError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "stripe_webhook_error",
  ) {
    super(message);
  }
}

interface StripeEvent<T = StripeObject> {
  id: string;
  type: string;
  data?: {
    object?: T;
  };
}

type StripeObject = Record<string, unknown>;

interface ResolvedSubscriptionState {
  ownerUserId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planCode: PaidPlanCode | "free";
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const PLAN_RANK: Record<PlanCode, number> = {
  free: 0,
  lite: 1,
  standard: 2,
  standard_plus: 3,
  self_hosted: 10,
  unlimited: 10,
};

function asObject(value: unknown): StripeObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as StripeObject
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  return asString(asObject(value)?.id);
}

function toIsoFromStripeSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function isFutureIso(value: string | null | undefined): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now();
}

function isDueIso(value: string | null | undefined): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now();
}

function isPlanDowngrade(fromPlanCode: PlanCode, toPlanCode: PlanCode): boolean {
  return PLAN_RANK[toPlanCode] < PLAN_RANK[fromPlanCode];
}

function isSubscriptionUsable(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

function normalizeStoredPlanCode(value: string | null | undefined): PlanCode {
  return isPlanCode(value) ? value : "free";
}

function normalizeStoredBillingInterval(value: string | null | undefined): BillingInterval | null {
  return isBillingInterval(value) ? value : null;
}

function metadataOwnerUserId(object: StripeObject | null): string | null {
  return asString(asObject(object?.metadata)?.owner_user_id);
}

function subscriptionStatus(value: unknown): SubscriptionStatus {
  switch (value) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    case "incomplete":
      return "incomplete";
    default:
      return "none";
  }
}

function priceIdFromSubscription(subscription: StripeObject): string | null {
  const items = asObject(subscription.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const firstItem = asObject(data[0]);
  const price = asObject(firstItem?.price);
  return asString(price?.id);
}

function parseStripeEvent(rawBody: string): StripeEvent {
  const parsed = JSON.parse(rawBody) as unknown;
  const event = asObject(parsed);
  const id = asString(event?.id);
  const type = asString(event?.type);
  if (!id || !type) {
    throw new StripeWebhookError("Invalid Stripe event payload", 400, "invalid_payload");
  }

  return {
    id,
    type,
    data: asObject(event?.data) as StripeEvent["data"],
  };
}

function parseSignatureHeader(signatureHeader: string) {
  const parts = signatureHeader.split(",");
  const timestamp = parts
    .map((part) => part.split("="))
    .find(([key]) => key === "t")?.[1];
  const signatures = parts
    .map((part) => part.split("="))
    .filter(([key, value]) => key === "v1" && !!value)
    .map(([, value]) => value);

  return { timestamp, signatures };
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string | null;
}) {
  if (!input.webhookSecret) {
    throw new StripeWebhookError("Stripe webhook secret is not configured", 503, "webhook_secret_not_configured");
  }
  if (!input.signatureHeader) {
    throw new StripeWebhookError("Stripe signature header is missing", 400, "signature_missing");
  }

  const { timestamp, signatures } = parseSignatureHeader(input.signatureHeader);
  const timestampNumber = timestamp ? Number(timestamp) : Number.NaN;
  if (!Number.isFinite(timestampNumber) || signatures.length === 0) {
    throw new StripeWebhookError("Stripe signature header is invalid", 400, "signature_invalid");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new StripeWebhookError("Stripe signature timestamp is outside tolerance", 400, "signature_expired");
  }

  const expected = createHmac("sha256", input.webhookSecret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "hex");
    return signatureBuffer.length === expectedBuffer.length
      && timingSafeEqual(signatureBuffer, expectedBuffer);
  });

  if (!valid) {
    throw new StripeWebhookError("Stripe signature verification failed", 400, "signature_verification_failed");
  }
}

async function getEventStatus(eventId: string) {
  return db.query.stripeEvents.findFirst({
    where: eq(stripeEvents.id, eventId),
  });
}

async function startEventProcessing(event: StripeEvent, rawBody: string) {
  const inserted = await db
    .insert(stripeEvents)
    .values({
      id: event.id,
      eventType: event.type,
      status: "processing",
      payload: rawBody,
      error: null,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) {
    return { shouldProcess: true, duplicate: false };
  }

  const existing = await getEventStatus(event.id);
  if (existing?.status === "failed") {
    await db
      .update(stripeEvents)
      .set({
        status: "processing",
        eventType: event.type,
        payload: rawBody,
        error: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(stripeEvents.id, event.id));
    return { shouldProcess: true, duplicate: false };
  }

  return { shouldProcess: false, duplicate: true };
}

async function finishEvent(
  eventId: string,
  status: "processed" | "ignored" | "failed",
  error?: string,
) {
  await db
    .update(stripeEvents)
    .set({
      status,
      error: error ?? null,
      processedAt: status === "failed" ? null : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(stripeEvents.id, eventId));
}

async function findOwnerByStripeIds(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  if (!input.stripeCustomerId && !input.stripeSubscriptionId) return null;
  const conditions = [
    input.stripeCustomerId
      ? eq(ownerSubscriptions.stripeCustomerId, input.stripeCustomerId)
      : null,
    input.stripeSubscriptionId
      ? eq(ownerSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId)
      : null,
  ].filter((condition): condition is NonNullable<typeof condition> => !!condition);

  return db.query.ownerSubscriptions.findFirst({
    where: or(...conditions),
  });
}

async function pendingBoardIdsForPlan(input: {
  ownerUserId: string;
  planCode: PlanCode;
  previousPendingPlanCode?: string | null;
  previousPendingEffectiveAt?: string | null;
  previousPendingActiveBoardIds?: string | null;
  nextEffectiveAt: string | null;
}) {
  const existingPendingIds = parsePendingActiveBoardIds(input.previousPendingActiveBoardIds);
  if (
    input.previousPendingPlanCode === input.planCode
    && input.previousPendingEffectiveAt === input.nextEffectiveAt
    && existingPendingIds.length > 0
  ) {
    return existingPendingIds;
  }

  return buildDefaultPendingActiveBoardIds(
    input.ownerUserId,
    getPlanDefinition(input.planCode).limits.boards,
  );
}

async function applyPendingIfDue(existing: typeof ownerSubscriptions.$inferSelect | null) {
  if (!existing?.pendingPlanCode || !isPlanCode(existing.pendingPlanCode)) return false;
  if (!isDueIso(existing.pendingPlanEffectiveAt)) return false;

  await applyPendingPlanBoardSelection({
    ownerUserId: existing.ownerUserId,
    pendingActiveBoardIds: parsePendingActiveBoardIds(existing.pendingActiveBoardIds),
    targetPlanCode: existing.pendingPlanCode,
  });
  return true;
}

async function applyFreePlanSelection(existing: typeof ownerSubscriptions.$inferSelect | null) {
  if (!existing) return;
  await applyPendingPlanBoardSelection({
    ownerUserId: existing.ownerUserId,
    pendingActiveBoardIds: parsePendingActiveBoardIds(existing.pendingActiveBoardIds),
    targetPlanCode: "free",
  });
}

async function upsertOwnerSubscription(state: ResolvedSubscriptionState) {
  const existing = await db.query.ownerSubscriptions.findFirst({
    where: eq(ownerSubscriptions.ownerUserId, state.ownerUserId),
  });
  const now = new Date().toISOString();
  const storedPlanCode = normalizeStoredPlanCode(existing?.planCode);
  const storedBillingInterval = normalizeStoredBillingInterval(existing?.billingInterval);
  const shouldApplyPending =
    existing?.pendingPlanCode === state.planCode && isDueIso(existing.pendingPlanEffectiveAt);

  if (shouldApplyPending) {
    await applyPendingIfDue(existing);
  }

  if (
    existing
    && !shouldApplyPending
    && state.cancelAtPeriodEnd
    && storedPlanCode !== "free"
    && isSubscriptionUsable(state.status)
    && isFutureIso(state.currentPeriodEnd)
  ) {
    const pendingIds = await pendingBoardIdsForPlan({
      ownerUserId: state.ownerUserId,
      planCode: "free",
      previousPendingPlanCode: existing.pendingPlanCode,
      previousPendingEffectiveAt: existing.pendingPlanEffectiveAt,
      previousPendingActiveBoardIds: existing.pendingActiveBoardIds,
      nextEffectiveAt: state.currentPeriodEnd,
    });

    await db
      .update(ownerSubscriptions)
      .set({
        billingMode: "stripe",
        planCode: storedPlanCode,
        billingInterval: storedBillingInterval,
        status: state.status,
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: true,
        pendingPlanCode: "free",
        pendingBillingInterval: null,
        pendingPlanEffectiveAt: state.currentPeriodEnd,
        pendingActiveBoardIds: JSON.stringify(pendingIds),
        updatedAt: now,
      })
      .where(eq(ownerSubscriptions.ownerUserId, state.ownerUserId));
    return;
  }

  if (
    existing
    && !shouldApplyPending
    && isSubscriptionUsable(state.status)
    && isFutureIso(state.currentPeriodEnd)
    && isPlanDowngrade(storedPlanCode, state.planCode)
  ) {
    const pendingIds = await pendingBoardIdsForPlan({
      ownerUserId: state.ownerUserId,
      planCode: state.planCode,
      previousPendingPlanCode: existing.pendingPlanCode,
      previousPendingEffectiveAt: existing.pendingPlanEffectiveAt,
      previousPendingActiveBoardIds: existing.pendingActiveBoardIds,
      nextEffectiveAt: state.currentPeriodEnd,
    });

    await db
      .update(ownerSubscriptions)
      .set({
        billingMode: "stripe",
        planCode: storedPlanCode,
        billingInterval: storedBillingInterval,
        status: state.status,
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        pendingPlanCode: state.planCode,
        pendingBillingInterval: state.billingInterval,
        pendingPlanEffectiveAt: state.currentPeriodEnd,
        pendingActiveBoardIds: JSON.stringify(pendingIds),
        updatedAt: now,
      })
      .where(eq(ownerSubscriptions.ownerUserId, state.ownerUserId));
    return;
  }

  const values = {
    billingMode: "stripe",
    planCode: state.planCode,
    billingInterval: state.billingInterval,
    status: state.status,
    stripeCustomerId: state.stripeCustomerId,
    stripeSubscriptionId: state.stripeSubscriptionId,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    pendingPlanCode: null,
    pendingBillingInterval: null,
    pendingPlanEffectiveAt: null,
    pendingActiveBoardIds: null,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(ownerSubscriptions)
      .set(values)
      .where(eq(ownerSubscriptions.ownerUserId, state.ownerUserId));
    return;
  }

  await db.insert(ownerSubscriptions).values({
    ownerUserId: state.ownerUserId,
    ...values,
  });
}

async function resolveOwnerUserIdFromObject(object: StripeObject, ids: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const ownerFromMetadata = metadataOwnerUserId(object)
    ?? asString(object.client_reference_id);
  if (ownerFromMetadata) return ownerFromMetadata;

  const existing = await findOwnerByStripeIds(ids);
  return existing?.ownerUserId ?? null;
}

async function handleCheckoutSessionCompleted(object: StripeObject) {
  const stripeCustomerId = stripeId(object.customer);
  const stripeSubscriptionId = stripeId(object.subscription);
  const ownerUserId = await resolveOwnerUserIdFromObject(object, {
    stripeCustomerId,
    stripeSubscriptionId,
  });
  if (!ownerUserId) {
    console.error("[billing/webhook] Owner not resolved for checkout.session.completed", {
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return "ignored" as const;
  }

  const existing = await db.query.ownerSubscriptions.findFirst({
    where: eq(ownerSubscriptions.ownerUserId, ownerUserId),
  });
  await upsertOwnerSubscription({
    ownerUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    planCode: existing?.planCode === "lite"
      || existing?.planCode === "standard"
      || existing?.planCode === "standard_plus"
      ? existing.planCode
      : "free",
    billingInterval: existing?.billingInterval === "monthly"
      || existing?.billingInterval === "yearly"
      ? existing.billingInterval
      : null,
    status: existing?.status === "trialing" ? "trialing" : "active",
    currentPeriodEnd: existing?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
  });

  return "processed" as const;
}

async function resolveSubscriptionState(subscription: StripeObject): Promise<ResolvedSubscriptionState | null> {
  const stripeCustomerId = stripeId(subscription.customer);
  const stripeSubscriptionId = stripeId(subscription.id);
  const ownerUserId = await resolveOwnerUserIdFromObject(subscription, {
    stripeCustomerId,
    stripeSubscriptionId,
  });
  if (!ownerUserId || !stripeSubscriptionId) {
    console.error("[billing/webhook] Owner or subscription id not resolved for subscription event", {
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return null;
  }

  const resolvedPrice = resolveStripePriceId(priceIdFromSubscription(subscription));
  if (!resolvedPrice) {
    console.error("[billing/webhook] Unknown subscription price id", {
      stripeCustomerId,
      stripeSubscriptionId,
      priceId: priceIdFromSubscription(subscription),
    });
    return null;
  }

  return {
    ownerUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    planCode: resolvedPrice.planCode,
    billingInterval: resolvedPrice.interval,
    status: subscriptionStatus(subscription.status),
    currentPeriodEnd: toIsoFromStripeSeconds(subscription.current_period_end),
    cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end),
  };
}

async function handleSubscriptionEvent(eventType: string, object: StripeObject) {
  const state = await resolveSubscriptionState(object);

  if (eventType === "customer.subscription.deleted") {
    if (!state) {
      const existing = await findOwnerByStripeIds({
        stripeCustomerId: stripeId(object.customer),
        stripeSubscriptionId: stripeId(object.id),
      });
      if (!existing) return "ignored" as const;

      await applyFreePlanSelection(existing);

      await db
        .update(ownerSubscriptions)
        .set({
          planCode: "free",
          billingInterval: null,
          status: "canceled",
          currentPeriodEnd: toIsoFromStripeSeconds(object.current_period_end),
          cancelAtPeriodEnd: false,
          pendingPlanCode: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: null,
          pendingActiveBoardIds: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(ownerSubscriptions.ownerUserId, existing.ownerUserId));
      return "processed" as const;
    }

    const existing = await db.query.ownerSubscriptions.findFirst({
      where: eq(ownerSubscriptions.ownerUserId, state.ownerUserId),
    });
    await applyFreePlanSelection(existing ?? null);

    await upsertOwnerSubscription({
      ...state,
      planCode: "free",
      billingInterval: null,
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    return "processed" as const;
  }

  if (!state) return "ignored" as const;

  await upsertOwnerSubscription(state);
  return "processed" as const;
}

async function handleInvoiceEvent(eventType: string, object: StripeObject) {
  const subscription = asObject(object.subscription);
  if (subscription) {
    const state = await resolveSubscriptionState(subscription);
    if (!state) return "ignored" as const;
    await upsertOwnerSubscription({
      ...state,
      status: eventType === "invoice.payment_failed" ? "past_due" : state.status,
    });
    return "processed" as const;
  }

  const stripeCustomerId = stripeId(object.customer);
  const stripeSubscriptionId = stripeId(object.subscription);
  const existing = await findOwnerByStripeIds({ stripeCustomerId, stripeSubscriptionId });
  if (!existing) {
    console.error("[billing/webhook] Existing subscription not found for invoice event", {
      stripeCustomerId,
      stripeSubscriptionId,
      eventType,
    });
    return "ignored" as const;
  }

  if (eventType === "invoice.payment_succeeded") {
    const applied = await applyPendingIfDue(existing);
    if (applied && existing.pendingPlanCode && isPlanCode(existing.pendingPlanCode)) {
      await db
        .update(ownerSubscriptions)
        .set({
          planCode: existing.pendingPlanCode,
          billingInterval: normalizeStoredBillingInterval(existing.pendingBillingInterval),
          status: "active",
          stripeCustomerId: stripeCustomerId ?? existing.stripeCustomerId,
          stripeSubscriptionId: stripeSubscriptionId ?? existing.stripeSubscriptionId,
          cancelAtPeriodEnd: false,
          pendingPlanCode: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: null,
          pendingActiveBoardIds: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(ownerSubscriptions.ownerUserId, existing.ownerUserId));
      return "processed" as const;
    }
  }

  await db
    .update(ownerSubscriptions)
    .set({
      status: eventType === "invoice.payment_failed" ? "past_due" : "active",
      stripeCustomerId: stripeCustomerId ?? existing.stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId ?? existing.stripeSubscriptionId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(ownerSubscriptions.ownerUserId, existing.ownerUserId));

  return "processed" as const;
}

async function processStripeEvent(event: StripeEvent) {
  if (!SUPPORTED_EVENTS.has(event.type)) {
    return "ignored" as const;
  }

  const object = asObject(event.data?.object);
  if (!object) {
    throw new StripeWebhookError("Stripe event object is invalid", 400, "invalid_event_object");
  }

  if (event.type === "checkout.session.completed") {
    return handleCheckoutSessionCompleted(object);
  }
  if (event.type.startsWith("customer.subscription.")) {
    return handleSubscriptionEvent(event.type, object);
  }
  if (event.type.startsWith("invoice.payment_")) {
    return handleInvoiceEvent(event.type, object);
  }

  return "ignored" as const;
}

export async function handleStripeWebhookEvent(input: {
  rawBody: string;
}) {
  const event = parseStripeEvent(input.rawBody);
  const eventState = await startEventProcessing(event, input.rawBody);
  if (!eventState.shouldProcess) {
    return {
      received: true,
      duplicate: eventState.duplicate,
      eventId: event.id,
      status: "duplicate",
    };
  }

  try {
    const status = await processStripeEvent(event);
    await finishEvent(event.id, status);
    return {
      received: true,
      duplicate: false,
      eventId: event.id,
      status,
    };
  } catch (error) {
    await finishEvent(
      event.id,
      "failed",
      error instanceof Error ? error.message : "Unknown webhook processing error",
    );
    throw error;
  }
}
