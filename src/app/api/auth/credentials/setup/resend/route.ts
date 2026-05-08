// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { signupRequests, users } from "@/db/schema";
import { isSmtpConfigured, sendOwnerSignupEmail } from "@/lib/mail";
import {
  buildPublicAppUrl,
  isUnauthenticatedSignupPreviewEnabled,
} from "@/lib/public-origin";
import {
  SIGNUP_REQUEST_COOKIE,
  computeSignupExpiry,
  generateSignupToken,
} from "@/lib/signup";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const SIGNUP_RESEND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_RESEND_RATE_LIMIT_MAX = 5;

/** POST /api/auth/credentials/setup/resend — resend owner signup email */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const signupRequestId = cookieStore.get(SIGNUP_REQUEST_COOKIE)?.value;

  if (!signupRequestId) {
    return NextResponse.json({ error: "仮登録情報が見つかりません" }, { status: 401 });
  }

  const signupRequest = await db.query.signupRequests.findFirst({
    where: and(
      eq(signupRequests.id, signupRequestId),
      isNull(signupRequests.completedAt),
    ),
  });

  if (!signupRequest) {
    return NextResponse.json({ error: "仮登録情報が見つかりません" }, { status: 404 });
  }
  const resendRateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "signup",
      clientIp: resolveRateLimitClientIp(request),
      subject: signupRequest.email,
    }),
    windowMs: SIGNUP_RESEND_RATE_LIMIT_WINDOW_MS,
    maxAttempts: SIGNUP_RESEND_RATE_LIMIT_MAX,
  });
  if (resendRateLimit.limited) {
    return NextResponse.json(
      {
        error: "登録メール再送の上限に達しました。しばらくしてから再度お試しください。",
        code: "signup_resend_rate_limited",
      },
      { status: 429 },
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

  const smtpConfigured = isSmtpConfigured();
  const previewEnabled = isUnauthenticatedSignupPreviewEnabled();
  if (!smtpConfigured && !previewEnabled) {
    return NextResponse.json(
      { error: "この環境では登録リンクを再発行できません。SMTP を設定してください" },
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

  const [updatedRequest] = await db
    .update(signupRequests)
    .set({ token, expiresAt })
    .where(eq(signupRequests.id, signupRequest.id))
    .returning();

  const mailSent = smtpConfigured
    ? await sendOwnerSignupEmail(updatedRequest.email, signupUrl)
    : false;

  if (!mailSent && smtpConfigured) {
    return NextResponse.json(
      { error: "登録メールの再送に失敗しました。時間を置いて再度お試しください" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    previewUrl: previewEnabled ? signupUrl : null,
  });
}
