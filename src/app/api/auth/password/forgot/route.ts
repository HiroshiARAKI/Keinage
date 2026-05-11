// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import {
  hashOneTimeToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/lib/account-security";
import { sendPasswordResetEmail, isSmtpConfigured } from "@/lib/mail";
import { generateResetToken } from "@/lib/pin";
import { buildPublicAppUrl } from "@/lib/public-origin";
import { normalizeSignupEmail } from "@/lib/signup";

/** POST /api/auth/password/forgot — issue a password reset email */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { identifier } = body as { identifier?: string };
  const normalizedIdentifier = typeof identifier === "string"
    ? identifier.trim()
    : "";

  if (!normalizedIdentifier) {
    return NextResponse.json(
      { error: "メールアドレスまたはユーザーIDを入力してください" },
      { status: 400 },
    );
  }

  if (!isSmtpConfigured()) {
    return NextResponse.json(
      { error: "この環境ではメールによるパスワード再設定を利用できません" },
      { status: 503 },
    );
  }

  const user = await db.query.users.findFirst({
    where: or(
      eq(users.email, normalizeSignupEmail(normalizedIdentifier)),
      eq(users.userId, normalizedIdentifier),
    ),
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ success: true });
  }

  const token = generateResetToken();
  const resetUrl = buildPublicAppUrl(`/password/reset/${token}`);
  if (!resetUrl) {
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です" },
      { status: 503 },
    );
  }

  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const mailSent = await sendPasswordResetEmail({
    to: user.email,
    resetUrl,
    acceptLanguage: request.headers.get("accept-language"),
    storedLocale: user.locale,
  });

  if (!mailSent) {
    return NextResponse.json(
      { error: "再設定メールの送信に失敗しました。時間を置いて再度お試しください" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}