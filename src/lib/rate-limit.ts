// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest } from "next/server";

export const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === "true";

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
  flow: "contact" | "credentials" | "pin";
  clientIp: string;
  subject: string;
}): string {
  return [
    params.flow,
    normalizeRateLimitSegment(params.clientIp),
    normalizeRateLimitSegment(params.subject),
  ].join(":");
}
