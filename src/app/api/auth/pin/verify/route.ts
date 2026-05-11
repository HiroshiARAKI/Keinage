// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions, pinAttempts, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  hashPin,
  needsPinRehash,
  verifyPin,
  generateSessionToken,
  MAX_PIN_ATTEMPTS,
  IP_BLOCK_DURATION_MS,
} from "@/lib/pin";
import {
  AUTH_SESSION_COOKIE,
  SESSION_MAX_AGE,
  DEFAULT_AUTH_EXPIRE_DAYS,
  AUTH_EXPIRE_DAYS_KEY,
  buildAuthCookieOptions,
  isFullAuthValid,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  clearLegacyLastUserCookie,
  getDeviceAuthGrantByToken,
  setDeviceAuthCookie,
} from "@/lib/device-auth";
import { getOwnerSetting } from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  buildRateLimitKey,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import {
  buildFailedAuthState,
  buildUnlockAuthState,
  isAccountLocked,
} from "@/lib/account-security";
import {
  resolveAuthenticatedLocale,
  setLocaleCookie,
} from "@/lib/locale-cookie";

/** POST /api/auth/pin/verify — verify PIN and issue session */
export async function POST(request: NextRequest) {
  const clientIp = resolveRateLimitClientIp(request);

  const body = await request.json();
  const { pin } = body as { pin?: string };

  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PINは6桁の数字で入力してください" },
      { status: 400 },
    );
  }

  const deviceToken = request.cookies.get(DEVICE_AUTH_COOKIE)?.value;
  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);
  const adminUser = deviceAuthGrant?.user ?? null;

  if (process.env.NODE_ENV !== "production") {
    console.log("[pin/verify] Device auth lookup", {
      hasDeviceAuthGrant: !!deviceAuthGrant,
      hasPIN: !!adminUser?.pinHash,
    });
  }

  const rateLimitKey = buildRateLimitKey({
    flow: "pin",
    clientIp,
    subject: adminUser?.userId ?? "no-device-auth",
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

  if (!deviceAuthGrant || !adminUser) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードによる認証が必要です", requiresFullAuth: true },
      { status: 403 },
    );
  }

  if (!adminUser.pinHash) {
    return NextResponse.json(
      { error: "PINが設定されていません。メールアドレスでログインしてください。", requiresFullAuth: true },
      { status: 403 },
    );
  }

  // Check full-auth validity
  const expireSetting = await getOwnerSetting(
    resolveOwnerUserId(adminUser),
    AUTH_EXPIRE_DAYS_KEY,
  );
  const expireDays = expireSetting
    ? parseInt(expireSetting, 10)
    : DEFAULT_AUTH_EXPIRE_DAYS;

  if (!isFullAuthValid(deviceAuthGrant.lastFullAuthAt, expireDays)) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードによる認証が必要です", requiresFullAuth: true },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  if (isAccountLocked(adminUser.lockedUntil, now)) {
    return NextResponse.json(
      {
        error:
          "このアカウントは一時的にロックされています。メールアドレスでログインしてパスワードを再設定するか、30分後に再度お試しください。",
        blocked: true,
        locked: true,
      },
      { status: 423 },
    );
  }

  if (!(await verifyPin(pin, adminUser.pinHash))) {
    // Record failed attempt
    await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });
    const failedState = buildFailedAuthState(adminUser.failedAuthAttempts);
    await db
      .update(users)
      .set({
        failedAuthAttempts: failedState.failedAuthAttempts,
        lockedUntil: failedState.lockedUntil,
        lastFailedAuthAt: failedState.lastFailedAuthAt,
      })
      .where(eq(users.id, adminUser.id));

    if (failedState.lockedNow) {
      return NextResponse.json(
        {
          error:
            "5回連続でPIN認証に失敗したため、アカウントを30分間ロックしました。メールアドレスでログインしてパスワードを再設定するか、30分後に再度お試しください。",
          blocked: true,
          locked: true,
        },
        { status: 423 },
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[pin/verify] PIN incorrect", { remaining: failedState.remaining });
    }
    return NextResponse.json(
      {
        error: `PINが正しくありません${failedState.remaining > 0 ? `（残り${failedState.remaining}回）` : ""}`,
        remaining: failedState.remaining,
      },
      { status: 401 },
    );
  }

  if (needsPinRehash(adminUser.pinHash)) {
    await db
      .update(users)
      .set({
        pinHash: await hashPin(pin),
        ...buildUnlockAuthState(),
      })
      .where(eq(users.id, adminUser.id));
  } else {
    await db
      .update(users)
      .set(buildUnlockAuthState())
      .where(eq(users.id, adminUser.id));
  }

  // Success — clear attempts for the verified subject bucket.
  await db.delete(pinAttempts).where(eq(pinAttempts.ipAddress, rateLimitKey));

  if (process.env.NODE_ENV !== "production") {
    console.log("[pin/verify] PIN verified OK");
  }

  // Create session in authSessions table
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await db.insert(authSessions).values({
    userId: adminUser.id,
    sessionToken,
    expiresAt,
  });

  const locale = resolveAuthenticatedLocale({
    storedLocale: adminUser.locale,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const res = NextResponse.json({ success: true, locale });
  res.cookies.set(AUTH_SESSION_COOKIE, sessionToken, buildAuthCookieOptions(SESSION_MAX_AGE));
  if (deviceToken) {
    setDeviceAuthCookie(res, deviceToken);
  }
  setLocaleCookie(res, locale);
  clearLegacyLastUserCookie(res);
  return res;
}
