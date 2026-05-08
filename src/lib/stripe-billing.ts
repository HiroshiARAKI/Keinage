// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getBillingConfig } from "@/lib/plans";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

interface StripeCustomer {
  id: string;
}

interface StripeSession {
  id: string;
  url: string | null;
}

interface StripeSubscription {
  id: string;
  status?: string;
  canceled_at?: number | null;
}

export type StripeApiObject = Record<string, unknown>;

export class StripeBillingError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = "stripe_request_failed",
  ) {
    super(message);
  }
}

function getStripeSecretKey(): string {
  const { stripeSecretKey } = getBillingConfig();
  if (!stripeSecretKey) {
    throw new StripeBillingError("Stripe secret key is not configured", 503, "stripe_not_configured");
  }
  return stripeSecretKey;
}

async function postStripeForm<T>(
  path: string,
  params: URLSearchParams,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: params,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message
      : "Stripe request failed";
    throw new StripeBillingError(message, response.status);
  }

  return data as T;
}

async function deleteStripeForm<T>(
  path: string,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${getStripeSecretKey()}`,
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message
      : "Stripe request failed";
    throw new StripeBillingError(message, response.status);
  }

  return data as T;
}

async function getStripeJson<T>(
  path: string,
  params?: URLSearchParams,
): Promise<T> {
  const query = params?.toString();
  const response = await fetch(`${STRIPE_API_BASE}${path}${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${getStripeSecretKey()}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message
      : "Stripe request failed";
    throw new StripeBillingError(message, response.status);
  }

  return data as T;
}

export async function createStripeCustomer(input: {
  ownerUserId: string;
  email: string;
  name?: string | null;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("email", input.email);
  params.set("metadata[owner_user_id]", input.ownerUserId);
  if (input.name) {
    params.set("name", input.name);
  }

  const customer = await postStripeForm<StripeCustomer>("/customers", params, {
    idempotencyKey: `keinage-owner-customer-${input.ownerUserId}`,
  });
  return customer.id;
}

export async function createStripeCheckoutSession(input: {
  ownerUserId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer", input.customerId);
  params.set("client_reference_id", input.ownerUserId);
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("allow_promotion_codes", "true");
  params.set("metadata[owner_user_id]", input.ownerUserId);
  params.set("subscription_data[metadata][owner_user_id]", input.ownerUserId);

  const session = await postStripeForm<StripeSession>("/checkout/sessions", params);
  if (!session.url) {
    throw new StripeBillingError("Stripe checkout session URL was not returned");
  }
  return session.url;
}

export async function createStripePortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("customer", input.customerId);
  params.set("return_url", input.returnUrl);

  const session = await postStripeForm<StripeSession>("/billing_portal/sessions", params);
  if (!session.url) {
    throw new StripeBillingError("Stripe portal session URL was not returned");
  }
  return session.url;
}

export async function cancelStripeSubscriptionImmediately(input: {
  stripeSubscriptionId: string;
  ownerUserId: string;
}): Promise<{ canceledAt: string }> {
  const subscription = await deleteStripeForm<StripeSubscription>(
    `/subscriptions/${encodeURIComponent(input.stripeSubscriptionId)}`,
    { idempotencyKey: `keinage-owner-delete-${input.ownerUserId}-${input.stripeSubscriptionId}` },
  );
  const canceledAt = typeof subscription.canceled_at === "number"
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : new Date().toISOString();
  return { canceledAt };
}

export async function retrieveStripeSubscription(
  stripeSubscriptionId: string,
): Promise<StripeApiObject> {
  const params = new URLSearchParams();
  params.append("expand[]", "items.data.price");
  params.append("expand[]", "schedule");
  return getStripeJson<StripeApiObject>(
    `/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
    params,
  );
}

export async function retrieveStripeSubscriptionSchedule(
  stripeScheduleId: string,
): Promise<StripeApiObject> {
  const params = new URLSearchParams();
  params.append("expand[]", "phases.items.price");
  return getStripeJson<StripeApiObject>(
    `/subscription_schedules/${encodeURIComponent(stripeScheduleId)}`,
    params,
  );
}
