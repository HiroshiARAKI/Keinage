// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "crypto";

export const ACCOUNT_LOCK_MAX_ATTEMPTS = 5;
export const ACCOUNT_LOCK_DURATION_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isAccountLocked(
  lockedUntil: string | null | undefined,
  nowIso: string,
): boolean {
  return Boolean(lockedUntil && lockedUntil > nowIso);
}

export function buildFailedAuthState(currentAttempts: number | null | undefined) {
  const failedAttempts = currentAttempts ?? 0;
  const nextAttempts = failedAttempts + 1;
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedNow = nextAttempts >= ACCOUNT_LOCK_MAX_ATTEMPTS;

  return {
    failedAuthAttempts: lockedNow ? 0 : nextAttempts,
    lastFailedAuthAt: nowIso,
    lockedUntil: lockedNow
      ? new Date(now.getTime() + ACCOUNT_LOCK_DURATION_MS).toISOString()
      : null,
    lockedNow,
    remaining: Math.max(ACCOUNT_LOCK_MAX_ATTEMPTS - nextAttempts, 0),
  };
}

export function buildSuccessfulAuthState(nowIso: string) {
  return {
    failedAuthAttempts: 0,
    lockedUntil: null,
    lastFailedAuthAt: null,
    lastFullAuthAt: nowIso,
  };
}

export function buildUnlockAuthState() {
  return {
    failedAuthAttempts: 0,
    lockedUntil: null,
    lastFailedAuthAt: null,
  };
}