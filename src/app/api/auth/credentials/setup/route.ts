// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { signupRequests, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { sendOwnerSignupEmail, isSmtpConfigured } from "@/lib/mail";
import { buildAuthCookieOptions } from "@/lib/auth";
import {
  buildPublicAppUrl,
  isUnauthenticatedSignupPreviewEnabled,
} from "@/lib/public-origin";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  SIGNUP_REQUEST_COOKIE,
  SIGNUP_REQUEST_COOKIE_MAX_AGE,
  computeSignupExpiry,
  generateSignupToken,
  isValidOrganizationName,
  isValidSignupEmail,
  isValidSignupUserId,
  normalizeOrganizationName,
  normalizePhoneNumber,
  normalizeSignupEmail,
} from "@/lib/signup";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_RATE_LIMIT_MAX = 10;

/** POST /api/auth/credentials/setup — request owner signup by email link */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, email, phoneNumber, organizationName } = body as {
    userId?: string;
    email?: string;
    phoneNumber?: string;
    organizationName?: string;
  };

  const normalizedUserId = userId?.trim() ?? "";
  const normalizedEmail = email ? normalizeSignupEmail(email) : "";
  const normalizedOrganizationName = normalizeOrganizationName(organizationName);

  if (
    !normalizedUserId ||
    !isValidSignupUserId(normalizedUserId)
  ) {
    return NextResponse.json(
      {
        error:
          "ユーザーIDは3〜32文字の英数字・アンダースコア・ハイフンで入力してください",
      },
      { status: 400 },
    );
  }
  if (!normalizedEmail || !isValidSignupEmail(normalizedEmail)) {
    return NextResponse.json(
      { error: "有効なメールアドレスを入力してください" },
      { status: 400 },
    );
  }
  const normalizedPhoneNumber =
    typeof phoneNumber === "string" ? normalizePhoneNumber(phoneNumber) : null;
  if (!normalizedPhoneNumber) {
    return NextResponse.json(
      { error: "電話番号を正しく入力してください" },
      { status: 400 },
    );
  }
  if (
    normalizedOrganizationName !== null &&
    !isValidOrganizationName(normalizedOrganizationName)
  ) {
    return NextResponse.json(
      { error: `組織名は${ORGANIZATION_NAME_MAX_LENGTH}文字以内で入力してください` },
      { status: 400 },
    );
  }
  const signupRateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "signup",
      clientIp: resolveRateLimitClientIp(request),
      subject: normalizedEmail || normalizedUserId || "missing-signup",
    }),
    windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
    maxAttempts: SIGNUP_RATE_LIMIT_MAX,
  });
  if (signupRateLimit.limited) {
    return NextResponse.json(
      {
        error: "登録リクエストの上限に達しました。しばらくしてから再度お試しください。",
        code: "signup_rate_limited",
      },
      { status: 429 },
    );
  }

  const existingUser = await db.query.users.findFirst({
    where: or(
      eq(users.userId, normalizedUserId),
      eq(users.email, normalizedEmail),
      eq(users.phoneNumber, normalizedPhoneNumber),
    ),
  });
  if (existingUser) {
    return NextResponse.json(
      {
        code: "user_exists",
        error: "登録済みのユーザーがあります。ログインしてください",
      },
      { status: 409 },
    );
  }

  const smtpConfigured = isSmtpConfigured();
  const previewEnabled = isUnauthenticatedSignupPreviewEnabled();
  if (!smtpConfigured && !previewEnabled) {
    return NextResponse.json(
      { error: "この環境では登録リンクを発行できません。SMTP を設定してください" },
      { status: 503 },
    );
  }

  const token = generateSignupToken();
  const expiresAt = computeSignupExpiry();
  const signupUrl = buildPublicAppUrl(`/signup/${token}`);
  if (!signupUrl) {
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です" },
      { status: 503 },
    );
  }

  const [signupRequest] = await db.insert(signupRequests).values({
    userId: normalizedUserId,
    email: normalizedEmail,
    phoneNumber: normalizedPhoneNumber,
    organizationName: normalizedOrganizationName,
    token,
    expiresAt,
  }).returning();

  const mailSent = smtpConfigured
    ? await sendOwnerSignupEmail(normalizedEmail, signupUrl)
    : false;

  if (!mailSent && smtpConfigured) {
    return NextResponse.json(
      { error: "登録メールの送信に失敗しました。時間を置いて再度お試しください" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    success: true,
    previewUrl: previewEnabled ? signupUrl : null,
  });
  res.cookies.set(
    SIGNUP_REQUEST_COOKIE,
    signupRequest.id,
    buildAuthCookieOptions(SIGNUP_REQUEST_COOKIE_MAX_AGE, request),
  );
  return res;
}
