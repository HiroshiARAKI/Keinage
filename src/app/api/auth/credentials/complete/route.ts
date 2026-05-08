// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authSessions, signupRequests, users } from "@/db/schema";
import {
  AUTH_SESSION_COOKIE,
  buildAuthCookieOptions,
  buildExpiredAuthCookieOptions,
  hashPassword,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  clearLegacyLastUserCookie,
  setDeviceAuthCookie,
  storeDeviceFullAuth,
} from "@/lib/device-auth";
import { generateSessionToken } from "@/lib/pin";
import { sendSignupCompletedEmail } from "@/lib/mail";
import { buildPublicAppUrl } from "@/lib/public-origin";
import { SIGNUP_REQUEST_COOKIE } from "@/lib/signup";
import { maybeBootstrapSuperOwner } from "@/lib/super-owner";

const SETUP_SESSION_MAX_AGE = 60 * 15;

function loginUrl(request: NextRequest) {
  return buildPublicAppUrl("/pin/login")
    ?? new URL("/pin/login", request.nextUrl.origin).toString();
}

/** POST /api/auth/credentials/complete — create the owner after email verification */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, password } = body as {
    token?: string;
    password?: string;
  };

  if (!token) {
    return NextResponse.json({ error: "登録トークンが必要です" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const signupRequest = await db.query.signupRequests.findFirst({
    where: and(
      eq(signupRequests.token, token),
      isNull(signupRequests.completedAt),
      gt(signupRequests.expiresAt, now),
    ),
  });

  if (!signupRequest) {
    return NextResponse.json(
      { error: "無効または期限切れの登録リンクです" },
      { status: 400 },
    );
  }

  const existingUser = await db.query.users.findFirst({
    where: or(
      eq(users.userId, signupRequest.userId),
      eq(users.email, signupRequest.email),
      eq(users.phoneNumber, signupRequest.phoneNumber),
    ),
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "この登録情報は既に使用されています。最初からやり直してください" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const [createdUser] = await db
    .insert(users)
    .values({
      userId: signupRequest.userId,
      email: signupRequest.email,
      phoneNumber: signupRequest.phoneNumber,
      passwordHash,
      attribute: "owner",
      role: "admin",
      lastFullAuthAt: now,
    })
    .returning();

  await db.insert(authAccounts).values({
    userId: createdUser.id,
    provider: "credentials",
    providerAccountId: signupRequest.email,
    email: signupRequest.email,
  });

  await maybeBootstrapSuperOwner({
    user: createdUser,
    emailVerified: true,
    authenticatedProvider: "credentials",
    request,
  });

  await db
    .update(signupRequests)
    .set({ completedAt: now })
    .where(eq(signupRequests.id, signupRequest.id));

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

  const cookieStore = await cookies();
  const { deviceToken } = await storeDeviceFullAuth({
    deviceToken: cookieStore.get(DEVICE_AUTH_COOKIE)?.value,
    userId: createdUser.id,
    authenticatedAt: now,
  });
  const res = NextResponse.json({ success: true, userId: createdUser.userId });
  res.cookies.set(AUTH_SESSION_COOKIE, sessionToken, buildAuthCookieOptions(SETUP_SESSION_MAX_AGE));
  setDeviceAuthCookie(res, deviceToken);
  clearLegacyLastUserCookie(res);
  if (cookieStore.get(SIGNUP_REQUEST_COOKIE)) {
    res.cookies.set(SIGNUP_REQUEST_COOKIE, "", buildExpiredAuthCookieOptions());
  }

  return res;
}
