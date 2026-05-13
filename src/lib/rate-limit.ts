// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { pinAttempts } from "@/db/schema";

export const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === "true";
export type RateLimitFlow =
  | "billing"
  | "contact"
  | "credentials"
  | "google-oauth"
  | "pin"
  | "signup"
  | "upload"
  | "webauthn";

function normalizeRateLimitSegment(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized.replace(/[^a-z0-9._:-]/g, "_");
}

/**
 * Route Handlers do not expose the socket remote address.
 * Proxy headers are therefore trusted only when the deployment explicitly
 * guarantees that every request passes through a trusted reverse proxy.
 */
export function resolveRateLimitClientIp(request: NextRequest): string {
  if (TRUST_PROXY_HEADERS) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const firstForwardedIp = forwardedFor
      ?.split(",")
      .map((value) => value.trim())
      .find(Boolean);
    if (firstForwardedIp) {
      return normalizeRateLimitSegment(firstForwardedIp);
    }

    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) {
      return normalizeRateLimitSegment(realIp);
    }
  }

  return "direct";
}

export function buildRateLimitKey(params: {
  flow: RateLimitFlow;
  clientIp: string;
  subject: string;
}): string {
  return [
    params.flow,
    normalizeRateLimitSegment(params.clientIp),
    normalizeRateLimitSegment(params.subject),
  ].join(":");
}

export async function countRecentRateLimitAttempts(
  rateLimitKey: string,
  windowMs: number,
) {
  const threshold = new Date(Date.now() - windowMs).toISOString();
  const recentAttempts = await db
    .select({ id: pinAttempts.id })
    .from(pinAttempts)
    .where(
      and(
        eq(pinAttempts.ipAddress, rateLimitKey),
        gt(pinAttempts.attemptedAt, threshold),
      ),
    );
  return recentAttempts.length;
}

export async function recordRateLimitAttempt(rateLimitKey: string) {
  await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
}

export async function consumeRateLimit(params: {
  rateLimitKey: string;
  windowMs: number;
  maxAttempts: number;
}): Promise<{ limited: boolean; remaining: number }> {
  const recentCount = await countRecentRateLimitAttempts(
    params.rateLimitKey,
    params.windowMs,
  );
  if (recentCount >= params.maxAttempts) {
    return { limited: true, remaining: 0 };
  }

  await recordRateLimitAttempt(params.rateLimitKey);
  return {
    limited: false,
    remaining: Math.max(params.maxAttempts - recentCount - 1, 0),
  };
}
