// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, authSessions } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { hashPin, generateSessionToken } from "@/lib/pin";
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
import { cookies } from "next/headers";
import { getOwnerSetting } from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import { isWebAuthnVerifiedAtSessionCreation } from "@/lib/webauthn";

/** POST /api/auth/pin/setup — set initial PIN for the admin user */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const deviceToken = cookieStore.get(DEVICE_AUTH_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json(
      { error: "サインアップセッションが見つかりません" },
      { status: 401 },
    );
  }

  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.sessionToken, sessionToken),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ),
    with: { user: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: "サインアップセッションが無効です。再度登録してください" },
      { status: 401 },
    );
  }

  const targetUser = session.user;
  if (!targetUser) {
    return NextResponse.json(
      { error: "管理者アカウントが未登録です。先にメールアドレスとパスワードを登録してください" },
      { status: 400 },
    );
  }

  // Check that PIN is not already set
  if (targetUser.pinHash) {
    return NextResponse.json(
      { error: "PINは既に設定されています" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { pin } = body as { pin?: string };

  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PINは6桁の数字で入力してください" },
      { status: 400 },
    );
  }

  // Retrieve configured auth expire days
  const ownerUserId = resolveOwnerUserId(targetUser);
  const expireSetting = await getOwnerSetting(ownerUserId, AUTH_EXPIRE_DAYS_KEY);
  const expireDays = expireSetting
    ? parseInt(expireSetting, 10)
    : DEFAULT_AUTH_EXPIRE_DAYS;
  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);
  const deviceAuthLastFullAuthAt = deviceAuthGrant?.user.id === targetUser.id
    ? deviceAuthGrant.lastFullAuthAt
    : null;

  // Verify full-auth is still valid (set during credentials/setup)
  if (!isFullAuthValid(deviceAuthLastFullAuthAt, expireDays)) {
    return NextResponse.json(
      { error: "認証セッションが無効です。再度ログインしてください" },
      { status: 401 },
    );
  }

  // Save PIN hash to users table
  const pinHash = await hashPin(pin);
  await db
    .update(users)
    .set({ pinHash })
    .where(eq(users.id, targetUser.id));

  // Delete any previous setup cookie session
  await db.delete(authSessions).where(eq(authSessions.sessionToken, sessionToken));

  // Create a proper auth session
  const fullSessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await db.insert(authSessions).values({
    userId: targetUser.id,
    sessionToken: fullSessionToken,
    webauthnVerified: await isWebAuthnVerifiedAtSessionCreation(targetUser),
    expiresAt,
  });

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_SESSION_COOKIE, fullSessionToken, buildAuthCookieOptions(SESSION_MAX_AGE, request));
  if (deviceToken) {
    setDeviceAuthCookie(res, deviceToken, request);
  }
  clearLegacyLastUserCookie(res, request);
  return res;
}
