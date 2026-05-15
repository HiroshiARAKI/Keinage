// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authSessions, sharedSignupRequests, users } from "@/db/schema";
import {
  AUTH_SESSION_COOKIE,
  buildAuthCookieOptions,
  hashPassword,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  clearLegacyLastUserCookie,
  setDeviceAuthCookie,
  storeDeviceFullAuth,
} from "@/lib/device-auth";
import { sendSignupCompletedEmail } from "@/lib/mail";
import { generateSessionToken } from "@/lib/pin";
import { buildPublicAppUrl } from "@/lib/public-origin";

const SETUP_SESSION_MAX_AGE = 60 * 15;

function loginUrl(request: NextRequest) {
  return buildPublicAppUrl("/pin/login")
    ?? new URL("/pin/login", request.nextUrl.origin).toString();
}

/** POST /api/auth/credentials/shared/complete — create shared user from invite */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, password } = body as {
    token?: string;
    password?: string;
  };

  if (!token) {
    return NextResponse.json({ error: "招待トークンが必要です" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const signupRequest = await db.query.sharedSignupRequests.findFirst({
    where: and(
      eq(sharedSignupRequests.token, token),
      isNull(sharedSignupRequests.completedAt),
      gt(sharedSignupRequests.expiresAt, now),
    ),
  });

  if (!signupRequest) {
    return NextResponse.json(
      { error: "無効または期限切れの招待リンクです" },
      { status: 400 },
    );
  }

  const existingUser = await db.query.users.findFirst({
    where: or(
      eq(users.userId, signupRequest.userId),
      eq(users.email, signupRequest.email),
    ),
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "この招待情報は既に使用されています。管理者に再招待を依頼してください" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const [createdUser] = await db
    .insert(users)
    .values({
      userId: signupRequest.userId,
      email: signupRequest.email,
      passwordHash,
      attribute: "shared",
      ownerUserId: signupRequest.ownerUserId,
      role: signupRequest.role,
      lastFullAuthAt: now,
    })
    .returning();

  await db.insert(authAccounts).values({
    userId: createdUser.id,
    provider: "credentials",
    providerAccountId: signupRequest.email,
    email: signupRequest.email,
  });

  await db
    .update(sharedSignupRequests)
    .set({ completedAt: now })
    .where(eq(sharedSignupRequests.id, signupRequest.id));

  await sendSignupCompletedEmail({
    to: createdUser.email,
    loginUrl: loginUrl(request),
    acceptLanguage: request.headers.get("accept-language"),
  });

  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SETUP_SESSION_MAX_AGE * 1000).toISOString();
  await db.insert(authSessions).values({
    userId: createdUser.id,
    sessionToken,
    expiresAt,
  });

  const { deviceToken } = await storeDeviceFullAuth({
    deviceToken: request.cookies.get(DEVICE_AUTH_COOKIE)?.value,
    userId: createdUser.id,
    authenticatedAt: now,
  });
  const res = NextResponse.json({ success: true, userId: createdUser.userId });
  res.cookies.set(AUTH_SESSION_COOKIE, sessionToken, buildAuthCookieOptions(SETUP_SESSION_MAX_AGE, request));
  setDeviceAuthCookie(res, deviceToken, request);
  clearLegacyLastUserCookie(res, request);
  return res;
}
