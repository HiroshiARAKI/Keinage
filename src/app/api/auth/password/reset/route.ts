// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, passwordResetTokens, pinAttempts, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import {
  buildUnlockAuthState,
  hashOneTimeToken,
} from "@/lib/account-security";
import {
  buildRateLimitKey,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import { normalizeSignupEmail } from "@/lib/signup";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";

/** POST /api/auth/password/reset — change password using a valid reset token */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, password } = body as { token?: string; password?: string };

  if (!token) {
    await writeAuditLog({
      action: "password_reset_failed",
      targetType: "password_reset_token",
      result: "failure",
      reason: "missing_token",
      request,
    });
    return NextResponse.json({ error: "トークンが必要です" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    await writeAuditLog({
      action: "password_reset_failed",
      targetType: "password_reset_token",
      result: "failure",
      reason: "invalid_password_format",
      request,
    });
    return NextResponse.json(
      { error: "パスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hashOneTimeToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now),
    ),
    with: { user: true },
  });

  if (!resetToken?.user || !resetToken.user.passwordHash) {
    await writeAuditLog({
      action: "password_reset_failed",
      targetType: "password_reset_token",
      result: "failure",
      reason: "invalid_or_expired_token",
      request,
    });
    return NextResponse.json(
      { error: "無効または期限切れのトークンです" },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({
      passwordHash,
      ...buildUnlockAuthState(),
    })
    .where(eq(users.id, resetToken.user.id));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, resetToken.id));

  await db.delete(authSessions).where(eq(authSessions.userId, resetToken.user.id));
  await writeUserAuditLog({
    user: resetToken.user,
    action: "password_reset_completed",
    result: "success",
    request,
    metadata: { sessionsRevoked: true },
  });
  await writeUserAuditLog({
    user: resetToken.user,
    action: "session_revoked",
    targetType: "session",
    targetId: resetToken.user.id,
    result: "success",
    reason: "password_reset_completed",
    request,
  });
  await writeUserAuditLog({
    user: resetToken.user,
    action: "account_unlocked",
    result: "success",
    reason: "password_reset_completed",
    request,
  });

  const clientIp = resolveRateLimitClientIp(request);
  const rateLimitKeys = [
    buildRateLimitKey({
      flow: "credentials",
      clientIp,
      subject: resetToken.user.userId,
    }),
    buildRateLimitKey({
      flow: "credentials",
      clientIp,
      subject: normalizeSignupEmail(resetToken.user.email),
    }),
    buildRateLimitKey({
      flow: "pin",
      clientIp,
      subject: resetToken.user.userId,
    }),
  ];

  await db.delete(pinAttempts).where(
    or(
      eq(pinAttempts.ipAddress, rateLimitKeys[0]),
      eq(pinAttempts.ipAddress, rateLimitKeys[1]),
      eq(pinAttempts.ipAddress, rateLimitKeys[2]),
    ),
  );

  await db.delete(passwordResetTokens).where(
    and(
      eq(passwordResetTokens.userId, resetToken.user.id),
      isNull(passwordResetTokens.usedAt),
    ),
  );

  return NextResponse.json({ success: true });
}
