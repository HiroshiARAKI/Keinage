// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/**
 * Hash a password using scrypt (memory-hard).
 * Returns "<hash>.<salt>" where both are hex-encoded.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/** Verify a plaintext password against a stored scrypt hash */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  try {
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedBuf = Buffer.from(hashed, "hex");
    if (buf.length !== hashedBuf.length) return false;
    return timingSafeEqual(buf, hashedBuf);
  } catch {
    return false;
  }
}

/** Auth session cookie name */
export const AUTH_SESSION_COOKIE = "auth-session";

const COOKIE_INSECURE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

/**
 * Legacy cookie that stored the last authenticated userId.
 * Kept only so newer auth flows can explicitly clear it during migration.
 */
export const LAST_USER_COOKIE = "last-user-id";

/** PIN session duration: 24 hours (in seconds, for cookie maxAge) */
export const SESSION_MAX_AGE = 60 * 60 * 24;

function shouldUseSecureAuthCookies(request?: Request) {
  const candidateUrl = request
    ? buildRequestHeaderAppUrl(request, "/")
    : getPublicAppOrigin();

  if (!candidateUrl) {
    return false;
  }

  try {
    const url = new URL(candidateUrl);
    if (COOKIE_INSECURE_HOSTNAMES.has(url.hostname.toLowerCase())) {
      return false;
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildAuthCookieOptions(maxAge: number, request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: shouldUseSecureAuthCookies(request),
  };
}

export function buildExpiredAuthCookieOptions(request?: Request) {
  return {
    ...buildAuthCookieOptions(0, request),
    expires: new Date(0),
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createCookieCommittedNavigationPage(input: {
  redirectTo: string;
  title?: string;
  message?: string;
}) {
  const escapedUrl = escapeHtml(input.redirectTo);
  const serializedUrl = JSON.stringify(input.redirectTo);
  const title = escapeHtml(input.title ?? "Redirecting...");
  const message = escapeHtml(input.message ?? "移動しています...");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
    <title>${title}</title>
  </head>
  <body>
    <p>${message}</p>
    <p><a href="${escapedUrl}">移動しない場合はこちら</a></p>
    <script>
      window.location.replace(${serializedUrl});
    </script>
  </body>
</html>`;
}

export function buildRelativeAppPath(input: {
  pathname: string;
  searchParams?: Record<string, string | null | undefined>;
}) {
  const url = new URL(input.pathname, "http://localhost");
  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

/** Default full-auth expiry: 30 days */
export const DEFAULT_AUTH_EXPIRE_DAYS = 30;

/** Maximum full-auth expiry: 365 days */
export const MAX_AUTH_EXPIRE_DAYS = 365;

/** Settings key for the configurable full-auth expiry (days) */
export const AUTH_EXPIRE_DAYS_KEY = "authExpireDays";

/** Compute the full-auth expiry date from lastFullAuthAt and configured days */
export function computeFullAuthExpiry(
  lastFullAuthAt: string | null | undefined,
  expireDays: number,
): Date | null {
  if (!lastFullAuthAt) return null;
  return new Date(
    new Date(lastFullAuthAt).getTime() + expireDays * 24 * 60 * 60 * 1000,
  );
}

/** Return true if full-auth is still valid */
export function isFullAuthValid(
  lastFullAuthAt: string | null | undefined,
  expireDays: number,
): boolean {
  const expiry = computeFullAuthExpiry(lastFullAuthAt, expireDays);
  if (!expiry) return false;
  return expiry > new Date();
}

// ── Session helper ────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  buildRequestHeaderAppUrl,
  getPublicAppOrigin,
} from "@/lib/public-origin";

/**
 * Read the current session from the cookie store and return the
 * associated session row (with user) if it is valid, or null.
 * Only for use inside Next.js request context (Route Handlers / Server
 * Components).
 */
export async function getSessionUser(options?: { allowWebAuthnPending?: boolean }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.sessionToken, token),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ),
    with: { user: true },
  });
  if (!session) return null;
  if (!options?.allowWebAuthnPending && !session.webauthnVerified) {
    return null;
  }
  return session;
}

export async function getSessionUserAllowingWebAuthnPending() {
  return getSessionUser({ allowWebAuthnPending: true });
}

/** Return the current session only when the authenticated user is an admin. */
export async function getAdminSessionUser() {
  const session = await getSessionUser();
  if (!session || session.user.role !== "admin") {
    return null;
  }

  return session;
}
