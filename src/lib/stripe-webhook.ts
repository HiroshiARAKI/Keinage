// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHmac, timingSafeEqual } from "crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  deletedOwnerBillingRecords,
  ownerSubscriptions,
  stripeEvents,
  users,
} from "@/db/schema";
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
import {
  retrieveStripeSubscription,
  retrieveStripeSubscriptionSchedule,
} from "@/lib/stripe-billing";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.released",
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
  stripeScheduleId: string | null;
  planCode: PaidPlanCode | "free";
  billingInterval: BillingInterval | null;
  currentPriceId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  pendingPlanCode: PlanCode | null;
  pendingPriceId: string | null;
  pendingBillingInterval: BillingInterval | null;
  pendingPlanEffectiveAt: string | null;
  lastSyncedAt: string;
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

function currentPeriodEndFromSubscription(subscription: StripeObject): string | null {
  const items = asObject(subscription.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const firstItem = asObject(data[0]);
  return toIsoFromStripeSeconds(firstItem?.current_period_end)
    ?? toIsoFromStripeSeconds(subscription.current_period_end);
}

function priceIdFromSchedulePhase(phase: StripeObject | null): string | null {
  const items = Array.isArray(phase?.items) ? phase.items : [];
  const firstItem = asObject(items[0]);
  const price = firstItem?.price;
  if (typeof price === "string") return price;
  return asString(asObject(price)?.id);
}

function scheduleStatusAllowsPending(schedule: StripeObject): boolean {
  const status = asString(schedule.status);
  return status === "active" || status === "not_started";
}

function pendingPlanFromSchedule(input: {
  schedule: StripeObject | null;
  currentPlanCode: PlanCode;
}): Pick<
  ResolvedSubscriptionState,
  "pendingPlanCode" | "pendingPriceId" | "pendingBillingInterval" | "pendingPlanEffectiveAt"
> {
  const empty = {
    pendingPlanCode: null,
    pendingPriceId: null,
    pendingBillingInterval: null,
    pendingPlanEffectiveAt: null,
  };
  if (!input.schedule || !scheduleStatusAllowsPending(input.schedule)) return empty;

  const currentPhase = asObject(input.schedule.current_phase);
  const effectiveAtSeconds = currentPhase?.end_date;
  if (typeof effectiveAtSeconds !== "number" || !Number.isFinite(effectiveAtSeconds)) return empty;

  const phases = Array.isArray(input.schedule.phases)
    ? input.schedule.phases
      .map((phase) => asObject(phase))
      .filter((phase): phase is StripeObject => !!phase)
      .sort((left, right) => Number(left.start_date ?? 0) - Number(right.start_date ?? 0))
    : [];
  const nextPhase = phases.find((phase) => {
    const startDate = phase.start_date;
    return typeof startDate === "number" && startDate >= effectiveAtSeconds;
  });
  const pendingPriceId = priceIdFromSchedulePhase(nextPhase ?? null);
  const resolvedPending = resolveStripePriceId(pendingPriceId);
  if (!resolvedPending || !isPlanDowngrade(input.currentPlanCode, resolvedPending.planCode)) {
    return empty;
  }

  return {
    pendingPlanCode: resolvedPending.planCode,
    pendingPriceId,
    pendingBillingInterval: resolvedPending.interval,
    pendingPlanEffectiveAt: toIsoFromStripeSeconds(effectiveAtSeconds),
  };
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

async function findDeletedOwnerBillingRecord(input: {
  ownerUserId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const conditions = [
    input.ownerUserId
      ? eq(deletedOwnerBillingRecords.ownerUserId, input.ownerUserId)
      : null,
    input.stripeCustomerId
      ? eq(deletedOwnerBillingRecords.stripeCustomerId, input.stripeCustomerId)
      : null,
    input.stripeSubscriptionId
      ? eq(deletedOwnerBillingRecords.stripeSubscriptionId, input.stripeSubscriptionId)
      : null,
  ].filter((condition): condition is NonNullable<typeof condition> => !!condition);

  if (conditions.length === 0) return null;
  return db.query.deletedOwnerBillingRecords.findFirst({
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
  if (existing?.deletedOwnerAt) {
    return;
  }
  const now = new Date().toISOString();
  const storedPlanCode = normalizeStoredPlanCode(existing?.planCode);
  const storedBillingInterval = normalizeStoredBillingInterval(existing?.billingInterval);
  const shouldApplyPending =
    existing?.pendingPlanCode === state.planCode && isDueIso(existing.pendingPlanEffectiveAt);

  if (shouldApplyPending) {
    await applyPendingIfDue(existing);
  }

  if (
    state.pendingPlanCode
    && isFutureIso(state.pendingPlanEffectiveAt)
    && isSubscriptionUsable(state.status)
  ) {
    const pendingIds = await pendingBoardIdsForPlan({
      ownerUserId: state.ownerUserId,
      planCode: state.pendingPlanCode,
      previousPendingPlanCode: existing?.pendingPlanCode,
      previousPendingEffectiveAt: existing?.pendingPlanEffectiveAt,
      previousPendingActiveBoardIds: existing?.pendingActiveBoardIds,
      nextEffectiveAt: state.pendingPlanEffectiveAt,
    });

    const values = {
      billingMode: "stripe",
      planCode: state.planCode,
      billingInterval: state.billingInterval,
      status: state.status,
      stripeCustomerId: state.stripeCustomerId,
      stripeSubscriptionId: state.stripeSubscriptionId,
      stripeScheduleId: state.stripeScheduleId,
      currentPriceId: state.currentPriceId,
      currentPeriodEnd: state.currentPeriodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      cancelAt: state.cancelAt,
      canceledAt: state.canceledAt,
      endedAt: state.endedAt,
      pendingPlanCode: state.pendingPlanCode,
      pendingPriceId: state.pendingPriceId,
      pendingBillingInterval: state.pendingBillingInterval,
      pendingPlanEffectiveAt: state.pendingPlanEffectiveAt,
      pendingActiveBoardIds: JSON.stringify(pendingIds),
      lastSyncedAt: state.lastSyncedAt,
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
    return;
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
        stripeScheduleId: state.stripeScheduleId,
        currentPriceId: state.currentPriceId,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: true,
        cancelAt: state.cancelAt,
        canceledAt: state.canceledAt,
        endedAt: state.endedAt,
        pendingPlanCode: "free",
        pendingPriceId: null,
        pendingBillingInterval: null,
        pendingPlanEffectiveAt: state.currentPeriodEnd,
        pendingActiveBoardIds: JSON.stringify(pendingIds),
        lastSyncedAt: state.lastSyncedAt,
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
        stripeScheduleId: state.stripeScheduleId,
        currentPriceId: state.currentPriceId,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        cancelAt: state.cancelAt,
        canceledAt: state.canceledAt,
        endedAt: state.endedAt,
        pendingPlanCode: state.planCode,
        pendingPriceId: state.currentPriceId,
        pendingBillingInterval: state.billingInterval,
        pendingPlanEffectiveAt: state.currentPeriodEnd,
        pendingActiveBoardIds: JSON.stringify(pendingIds),
        lastSyncedAt: state.lastSyncedAt,
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
    stripeScheduleId: state.stripeScheduleId,
    currentPriceId: state.currentPriceId,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    cancelAt: state.cancelAt,
    canceledAt: state.canceledAt,
    endedAt: state.endedAt,
    pendingPlanCode: null,
    pendingPriceId: null,
    pendingBillingInterval: null,
    pendingPlanEffectiveAt: null,
    pendingActiveBoardIds: null,
    lastSyncedAt: state.lastSyncedAt,
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
  if (ownerFromMetadata) {
    const [owner, deletedRecord] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, ownerFromMetadata),
      }),
      findDeletedOwnerBillingRecord({
        ownerUserId: ownerFromMetadata,
        stripeCustomerId: ids.stripeCustomerId,
        stripeSubscriptionId: ids.stripeSubscriptionId,
      }),
    ]);
    if (deletedRecord) return null;
    return owner?.id ?? null;
  }

  const existing = await findOwnerByStripeIds(ids);
  if (existing?.deletedOwnerAt) return null;
  if (!existing) {
    const deletedRecord = await findDeletedOwnerBillingRecord(ids);
    if (deletedRecord) return null;
  }
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
    stripeScheduleId: existing?.stripeScheduleId ?? null,
    planCode: existing?.planCode === "lite"
      || existing?.planCode === "standard"
      || existing?.planCode === "standard_plus"
      ? existing.planCode
      : "free",
    billingInterval: existing?.billingInterval === "monthly"
      || existing?.billingInterval === "yearly"
      ? existing.billingInterval
      : null,
    currentPriceId: existing?.currentPriceId ?? null,
    status: existing?.status === "trialing" ? "trialing" : "active",
    currentPeriodEnd: existing?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
    cancelAt: existing?.cancelAt ?? null,
    canceledAt: existing?.canceledAt ?? null,
    endedAt: existing?.endedAt ?? null,
    pendingPlanCode: existing?.pendingPlanCode && isPlanCode(existing.pendingPlanCode)
      ? existing.pendingPlanCode
      : null,
    pendingPriceId: existing?.pendingPriceId ?? null,
    pendingBillingInterval: normalizeStoredBillingInterval(existing?.pendingBillingInterval),
    pendingPlanEffectiveAt: existing?.pendingPlanEffectiveAt ?? null,
    lastSyncedAt: new Date().toISOString(),
  });

  return "processed" as const;
}

async function resolveSubscriptionState(
  subscription: StripeObject,
  scheduleOverride?: StripeObject | null,
): Promise<ResolvedSubscriptionState | null> {
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

  const currentPriceId = priceIdFromSubscription(subscription);
  const resolvedPrice = resolveStripePriceId(currentPriceId);
  if (!resolvedPrice) {
    console.error("[billing/webhook] Unknown subscription price id", {
      stripeCustomerId,
      stripeSubscriptionId,
      priceId: priceIdFromSubscription(subscription),
    });
    return null;
  }
  const stripeScheduleId = stripeId(subscription.schedule);
  const schedule = scheduleOverride
    ?? (stripeScheduleId ? await retrieveStripeSubscriptionSchedule(stripeScheduleId) : null);
  const currentPeriodEnd = currentPeriodEndFromSubscription(subscription);
  const cancelAt = toIsoFromStripeSeconds(subscription.cancel_at);
  const cancelAtPeriodEnd = asBoolean(subscription.cancel_at_period_end);
  const pendingFromSchedule = pendingPlanFromSchedule({
    schedule,
    currentPlanCode: resolvedPrice.planCode,
  });
  const cancelEffectiveAt = cancelAt ?? currentPeriodEnd;
  const isCancelScheduled =
    (cancelAtPeriodEnd || isFutureIso(cancelAt))
    && isSubscriptionUsable(subscriptionStatus(subscription.status))
    && isFutureIso(cancelEffectiveAt);
  const pendingForCancel =
    isCancelScheduled
      ? {
          pendingPlanCode: "free" as const,
          pendingPriceId: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: cancelEffectiveAt,
        }
      : null;
  const pending = pendingForCancel ?? pendingFromSchedule;

  return {
    ownerUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeScheduleId,
    planCode: resolvedPrice.planCode,
    billingInterval: resolvedPrice.interval,
    currentPriceId,
    status: subscriptionStatus(subscription.status),
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelAt,
    canceledAt: toIsoFromStripeSeconds(subscription.canceled_at),
    endedAt: toIsoFromStripeSeconds(subscription.ended_at),
    pendingPlanCode: pending.pendingPlanCode,
    pendingPriceId: pending.pendingPriceId,
    pendingBillingInterval: pending.pendingBillingInterval,
    pendingPlanEffectiveAt: pending.pendingPlanEffectiveAt,
    lastSyncedAt: new Date().toISOString(),
  };
}

async function handleSubscriptionEvent(eventType: string, object: StripeObject) {
  const latestSubscriptionId = stripeId(object.id);
  const subscription = latestSubscriptionId
    ? await retrieveStripeSubscription(latestSubscriptionId)
    : object;
  const state = await resolveSubscriptionState(subscription);

  if (eventType === "customer.subscription.deleted") {
    if (!state) {
      const existing = await findOwnerByStripeIds({
        stripeCustomerId: stripeId(object.customer),
        stripeSubscriptionId: stripeId(object.id),
      });
      if (!existing || existing.deletedOwnerAt) return "ignored" as const;

      await applyFreePlanSelection(existing);

      await db
        .update(ownerSubscriptions)
        .set({
          planCode: "free",
          billingInterval: null,
          status: "canceled",
          currentPeriodEnd: currentPeriodEndFromSubscription(object),
          cancelAtPeriodEnd: false,
          cancelAt: toIsoFromStripeSeconds(object.cancel_at),
          canceledAt: toIsoFromStripeSeconds(object.canceled_at),
          endedAt: toIsoFromStripeSeconds(object.ended_at),
          pendingPlanCode: null,
          pendingPriceId: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: null,
          pendingActiveBoardIds: null,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(ownerSubscriptions.ownerUserId, existing.ownerUserId));
      return "processed" as const;
    }

    const existing = await db.query.ownerSubscriptions.findFirst({
      where: eq(ownerSubscriptions.ownerUserId, state.ownerUserId),
    });
    if (existing?.deletedOwnerAt) return "ignored" as const;
    await applyFreePlanSelection(existing ?? null);

    await upsertOwnerSubscription({
      ...state,
      planCode: "free",
      billingInterval: null,
      status: "canceled",
      cancelAtPeriodEnd: false,
      pendingPlanCode: null,
      pendingPriceId: null,
      pendingBillingInterval: null,
      pendingPlanEffectiveAt: null,
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
  if (stripeSubscriptionId) {
    const latestSubscription = await retrieveStripeSubscription(stripeSubscriptionId);
    const state = await resolveSubscriptionState(latestSubscription);
    if (state) {
      await upsertOwnerSubscription({
        ...state,
        status: eventType === "invoice.payment_failed" ? "past_due" : state.status,
      });
      return "processed" as const;
    }
  }

  const existing = await findOwnerByStripeIds({ stripeCustomerId, stripeSubscriptionId });
  if (existing?.deletedOwnerAt) {
    return "ignored" as const;
  }
  if (!existing) {
    const deletedRecord = await findDeletedOwnerBillingRecord({
      stripeCustomerId,
      stripeSubscriptionId,
    });
    if (deletedRecord) {
      return "ignored" as const;
    }

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
          pendingPriceId: null,
          pendingPlanCode: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: null,
          pendingActiveBoardIds: null,
          lastSyncedAt: new Date().toISOString(),
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
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(ownerSubscriptions.ownerUserId, existing.ownerUserId));

  return "processed" as const;
}

async function handleSubscriptionScheduleEvent(object: StripeObject) {
  const stripeScheduleId = stripeId(object.id);
  if (!stripeScheduleId) return "ignored" as const;

  const schedule = await retrieveStripeSubscriptionSchedule(stripeScheduleId);
  const stripeSubscriptionId = stripeId(schedule.subscription);
  if (!stripeSubscriptionId) {
    return "ignored" as const;
  }

  const subscription = await retrieveStripeSubscription(stripeSubscriptionId);
  const state = await resolveSubscriptionState(subscription, schedule);
  if (!state) return "ignored" as const;

  await upsertOwnerSubscription(state);
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
  if (event.type.startsWith("subscription_schedule.")) {
    return handleSubscriptionScheduleEvent(object);
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
