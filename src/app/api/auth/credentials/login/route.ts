// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq, or, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { users, pinAttempts, authSessions } from "@/db/schema";
import {
  verifyPassword,
  AUTH_SESSION_COOKIE,
  SESSION_MAX_AGE,
  buildAuthCookieOptions,
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

/** POST /api/auth/credentials/login — email/userId + password login */
export async function POST(request: NextRequest) {
  const clientIp = resolveRateLimitClientIp(request);

  const body = await request.json();
  const { identifier, password } = body as {
    identifier?: string;
    password?: string;
  };

  const normalizedIdentifier = identifier?.trim() ?? "";
  const rateLimitKey = buildRateLimitKey({
    flow: "credentials",
    clientIp,
    subject: normalizedIdentifier || "missing-identifier",
  });

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
    return NextResponse.json(
      {
        error:
          "試行回数の上限に達しました。24時間後に再度お試しください。",
        blocked: true,
      },
      { status: 429 },
    );
  }

  if (!normalizedIdentifier || !password) {
    return NextResponse.json(
      { error: "ユーザーIDまたはメールアドレスとパスワードを入力してください" },
      { status: 400 },
    );
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

  if (!user) {
    await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
    return NextResponse.json(
      { error: "ユーザーIDまたはパスワードが正しくありません" },
      { status: 401 },
    );
  }

  const now = new Date().toISOString();
  if (isAccountLocked(user.lockedUntil, now)) {
    return NextResponse.json(
      {
        error: user.passwordHash
          ? "このアカウントは一時的にロックされています。パスワードを再設定するか、30分後に再度お試しください。"
          : "このアカウントは一時的にロックされています。Googleでログインし、必要に応じてPIN初期化を利用するか、30分後に再度お試しください。",
        blocked: true,
        locked: true,
      },
      { status: 423 },
    );
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
      return NextResponse.json(
        {
          error:
            "Google連携ユーザに対して5回連続でパスワードログインが失敗したため、アカウントを30分間ロックしました。Googleでログインし、必要に応じてPIN初期化を利用するか、30分後に再度お試しください。",
          blocked: true,
          locked: true,
        },
        { status: 423 },
      );
    }

    return NextResponse.json(
      {
        error: `当該ユーザはGoogleアカウント連携をしているのでパスワードログインやパスワードリセットはできません。Googleでログインしてください。PINを忘れた場合は、Googleログイン後にPIN初期化を利用してください${failedState.remaining > 0 ? `（残り${failedState.remaining}回でロック）` : ""}`,
        remaining: failedState.remaining,
      },
      { status: 401 },
    );
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
      return NextResponse.json(
        {
          error:
            "5回連続で認証に失敗したため、アカウントを30分間ロックしました。パスワード再設定後、または30分後に再度お試しください。",
          blocked: true,
          locked: true,
        },
        { status: 423 },
      );
    }

    return NextResponse.json(
      {
        error: `ユーザーIDまたはパスワードが正しくありません${failedState.remaining > 0 ? `（残り${failedState.remaining}回）` : ""}`,
        remaining: failedState.remaining,
      },
      { status: 401 },
    );
  }

  await db.delete(pinAttempts).where(eq(pinAttempts.ipAddress, rateLimitKey));

  if (process.env.NODE_ENV !== "production") {
    console.log("[credentials/login] Password verified OK");
  }

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
  res.cookies.set(AUTH_SESSION_COOKIE, sessionToken, buildAuthCookieOptions(SESSION_MAX_AGE, request));
  setDeviceAuthCookie(res, deviceToken, request);
  setLocaleCookie(res, locale);
  clearLegacyLastUserCookie(res, request);
  return res;
}
