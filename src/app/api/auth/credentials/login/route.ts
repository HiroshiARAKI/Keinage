// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, pinAttempts, authSessions } from "@/db/schema";
import { eq, or, and, gt } from "drizzle-orm";
import {
  verifyPassword,
  AUTH_SESSION_COOKIE,
  SESSION_MAX_AGE,
  buildAuthCookieOptions,
  createCookieCommittedNavigationPage,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  clearLegacyLastUserCookie,
  setDeviceAuthCookie,
  storeDeviceFullAuth,
} from "@/lib/device-auth";
import {
  MAX_PIN_ATTEMPTS,
  IP_BLOCK_DURATION_MS,
  generateSessionToken,
} from "@/lib/pin";
import {
  buildFailedAuthState,
  buildSuccessfulAuthState,
  isAccountLocked,
} from "@/lib/account-security";
import {
  buildRateLimitKey,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import {
  resolveAuthenticatedLocale,
  setLocaleCookie,
} from "@/lib/locale-cookie";
import { maybeBootstrapSuperOwner } from "@/lib/super-owner";
import {
  getWebAuthnPostAuthAction,
  isWebAuthnVerifiedAtSessionCreation,
} from "@/lib/webauthn";
import { sanitizeRedirectTarget } from "@/lib/utils";

function getRequestedRedirectTo(request: NextRequest, contentType: string, body: {
  redirectTo?: string;
}) {
  const bodyRedirectTo = sanitizeRedirectTarget(body.redirectTo ?? null);
  if (bodyRedirectTo) {
    return bodyRedirectTo;
  }

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return null;
  }

  return sanitizeRedirectTarget(request.nextUrl.searchParams.get("redirectTo"));
}

function createLoginRedirectResponse(request: NextRequest, input: {
  redirectTo: string | null;
  error: string;
}) {
  const url = new URL("/pin/login", request.url);
  if (input.redirectTo) {
    url.searchParams.set("redirectTo", input.redirectTo);
  }
  url.searchParams.set("error", input.error);
  return NextResponse.redirect(url, 303);
}

/** POST /api/auth/credentials/login — email/userId + password login */
export async function POST(request: NextRequest) {
  const clientIp = resolveRateLimitClientIp(request);
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());
  const { identifier, password } = body as {
    identifier?: string;
    password?: string;
    redirectTo?: string;
  };
  const requestedRedirectTo = getRequestedRedirectTo(request, contentType, body);
  const expectsJson = contentType.includes("application/json");

  const normalizedIdentifier = identifier?.trim() ?? "";
  const rateLimitKey = buildRateLimitKey({
    flow: "credentials",
    clientIp,
    subject: normalizedIdentifier || "missing-identifier",
  });

  // Rate-limit per client/subject bucket. Proxy headers are trusted only when configured.
  const blockThreshold = new Date(
    Date.now() - IP_BLOCK_DURATION_MS,
  ).toISOString();
  const recentAttempts = await db
    .select()
    .from(pinAttempts)
    .where(
      and(
        eq(pinAttempts.ipAddress, rateLimitKey),
        gt(pinAttempts.attemptedAt, blockThreshold),
      ),
    );

  if (recentAttempts.length >= MAX_PIN_ATTEMPTS) {
    const error = "試行回数の上限に達しました。24時間後に再度お試しください。";
    return expectsJson
      ? NextResponse.json({ error, blocked: true }, { status: 429 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  if (!normalizedIdentifier || !password) {
    const error = "ユーザーIDまたはメールアドレスとパスワードを入力してください";
    return expectsJson
      ? NextResponse.json({ error }, { status: 400 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  const user = await db.query.users.findFirst({
    where: or(
      eq(users.email, normalizedIdentifier),
      eq(users.userId, normalizedIdentifier),
    ),
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[credentials/login] User lookup", {
      found: !!user,
    });
  }

  // Constant-time failure to prevent user enumeration
  if (!user) {
    await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
    const error = "ユーザーIDまたはパスワードが正しくありません";
    return expectsJson
      ? NextResponse.json({ error }, { status: 401 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  const now = new Date().toISOString();
  if (isAccountLocked(user.lockedUntil, now)) {
    const error = user.passwordHash
      ? "このアカウントは一時的にロックされています。パスワードを再設定するか、30分後に再度お試しください。"
      : "このアカウントは一時的にロックされています。Googleでログインし、必要に応じてPIN初期化を利用するか、30分後に再度お試しください。";
    return expectsJson
      ? NextResponse.json({ error, blocked: true, locked: true }, { status: 423 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  if (!user.passwordHash) {
    await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
    const failedState = buildFailedAuthState(user.failedAuthAttempts);
    await db
      .update(users)
      .set({
        failedAuthAttempts: failedState.failedAuthAttempts,
        lockedUntil: failedState.lockedUntil,
        lastFailedAuthAt: failedState.lastFailedAuthAt,
      })
      .where(eq(users.id, user.id));

    if (failedState.lockedNow) {
      const error = "Google連携ユーザに対して5回連続でパスワードログインが失敗したため、アカウントを30分間ロックしました。Googleでログインし、必要に応じてPIN初期化を利用するか、30分後に再度お試しください。";
      return expectsJson
        ? NextResponse.json({ error, blocked: true, locked: true }, { status: 423 })
        : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
    }

    const error = `当該ユーザはGoogleアカウント連携をしているのでパスワードログインやパスワードリセットはできません。Googleでログインしてください。PINを忘れた場合は、Googleログイン後にPIN初期化を利用してください${failedState.remaining > 0 ? `（残り${failedState.remaining}回でロック）` : ""}`;
    return expectsJson
      ? NextResponse.json({ error, remaining: failedState.remaining }, { status: 401 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (process.env.NODE_ENV !== "production") {
    console.log("[credentials/login] Password verify result", { valid });
  }
  if (!valid) {
    await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
    const failedState = buildFailedAuthState(user.failedAuthAttempts);
    await db
      .update(users)
      .set({
        failedAuthAttempts: failedState.failedAuthAttempts,
        lockedUntil: failedState.lockedUntil,
        lastFailedAuthAt: failedState.lastFailedAuthAt,
      })
      .where(eq(users.id, user.id));

    if (failedState.lockedNow) {
      const error = "5回連続で認証に失敗したため、アカウントを30分間ロックしました。パスワード再設定後、または30分後に再度お試しください。";
      return expectsJson
        ? NextResponse.json({ error, blocked: true, locked: true }, { status: 423 })
        : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
    }

    const error = `ユーザーIDまたはパスワードが正しくありません${failedState.remaining > 0 ? `（残り${failedState.remaining}回）` : ""}`;
    return expectsJson
      ? NextResponse.json({ error, remaining: failedState.remaining }, { status: 401 })
      : createLoginRedirectResponse(request, { redirectTo: requestedRedirectTo, error });
  }

  // Clear attempts for the successfully authenticated subject bucket.
  await db.delete(pinAttempts).where(eq(pinAttempts.ipAddress, rateLimitKey));

  if (process.env.NODE_ENV !== "production") {
    console.log("[credentials/login] Password verified OK");
  }

  // Record full-auth timestamp
  await db
    .update(users)
    .set(buildSuccessfulAuthState(now))
    .where(eq(users.id, user.id));

  await maybeBootstrapSuperOwner({
    user,
    emailVerified: true,
    authenticatedProvider: "credentials",
    request,
  });

  const { deviceToken } = await storeDeviceFullAuth({
    deviceToken: request.cookies.get(DEVICE_AUTH_COOKIE)?.value,
    userId: user.id,
    authenticatedAt: now,
  });

  // Create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await db.insert(authSessions).values({
    userId: user.id,
    sessionToken,
    webauthnVerified: await isWebAuthnVerifiedAtSessionCreation(user),
    expiresAt,
  });

  const locale = resolveAuthenticatedLocale({
    storedLocale: user.locale,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const webauthnAction = await getWebAuthnPostAuthAction(user);
  const nextPath = webauthnAction === "register"
    ? requestedRedirectTo
      ? `/passkey/setup?redirectTo=${encodeURIComponent(requestedRedirectTo)}`
      : "/passkey/setup"
    : webauthnAction === "authenticate"
      ? requestedRedirectTo
        ? `/passkey/verify?redirectTo=${encodeURIComponent(requestedRedirectTo)}`
        : "/passkey/verify"
      : requestedRedirectTo ?? "/boards";
  const res = NextResponse.json({
    success: true,
    locale,
    webauthnAction,
    redirectTo: webauthnAction === "register"
      ? "/passkey/setup"
      : webauthnAction === "authenticate"
        ? "/passkey/verify"
        : null,
  });
  const response = expectsJson
    ? res
    : new NextResponse(
        createCookieCommittedNavigationPage({
          redirectTo: new URL(nextPath, request.url).toString(),
          title: "Signing in...",
          message: "サインインを完了しています...",
        }),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
  response.cookies.set(AUTH_SESSION_COOKIE, sessionToken, buildAuthCookieOptions(SESSION_MAX_AGE));
  setDeviceAuthCookie(response, deviceToken);
  setLocaleCookie(response, locale);
  clearLegacyLastUserCookie(response);
  return response;
}
