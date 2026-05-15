// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountDeletionRequests } from "@/db/schema";
import {
  AUTH_EXPIRE_DAYS_KEY,
  DEFAULT_AUTH_EXPIRE_DAYS,
  getSessionUser,
  isFullAuthValid,
} from "@/lib/auth";
import {
  computeAccountDeletionExpiry,
  generateAccountDeletionToken,
} from "@/lib/account-deletion";
import { DEVICE_AUTH_COOKIE, getDeviceAuthGrantByToken } from "@/lib/device-auth";
import { sendAccountDeletionEmail, isSmtpConfigured } from "@/lib/mail";
import { getOwnerSetting } from "@/lib/owner-settings";
import { isOwnerUser } from "@/lib/ownership";
import {
  buildPublicAppUrl,
  isUnauthenticatedSignupPreviewEnabled,
} from "@/lib/public-origin";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";

/** POST /api/auth/account-deletion/request — send owner account deletion link */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    await writeAuditLog({
      action: "account_delete_requested",
      targetType: "user",
      result: "denied",
      reason: "session_missing",
      request,
    });
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "DELETE") {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "failure",
      reason: "confirmation_mismatch",
      request,
    });
    return NextResponse.json(
      { error: "確認入力が一致しません" },
      { status: 400 },
    );
  }

  if (!isOwnerUser(session.user)) {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "denied",
      reason: "owner_required",
      request,
    });
    return NextResponse.json(
      { error: "Ownerアカウントのみ退会できます" },
      { status: 403 },
    );
  }

  const deviceToken = request.cookies.get(DEVICE_AUTH_COOKIE)?.value;
  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);
  const expireSetting = await getOwnerSetting(session.user.id, AUTH_EXPIRE_DAYS_KEY);
  const expireDays = expireSetting
    ? parseInt(expireSetting, 10)
    : DEFAULT_AUTH_EXPIRE_DAYS;
  const deviceAuthLastFullAuthAt = deviceAuthGrant?.user.id === session.user.id
    ? deviceAuthGrant.lastFullAuthAt
    : null;

  if (!isFullAuthValid(deviceAuthLastFullAuthAt, expireDays)) {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "denied",
      reason: "full_auth_required",
      request,
    });
    return NextResponse.json(
      { error: "メールアドレスとパスワードによる再認証が必要です" },
      { status: 403 },
    );
  }

  const smtpConfigured = isSmtpConfigured();
  const previewEnabled = isUnauthenticatedSignupPreviewEnabled();
  if (!smtpConfigured && !previewEnabled) {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "failure",
      reason: "smtp_not_configured",
      request,
    });
    return NextResponse.json(
      { error: "この環境では削除リンクを発行できません。SMTP を設定してください" },
      { status: 503 },
    );
  }

  const token = generateAccountDeletionToken();
  const expiresAt = computeAccountDeletionExpiry();
  const deletionUrl = buildPublicAppUrl(`/deleting-account/${token}`);
  if (!deletionUrl) {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "failure",
      reason: "public_origin_not_configured",
      request,
    });
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です" },
      { status: 503 },
    );
  }

  const existingRequest = await db.query.accountDeletionRequests.findFirst({
    where: eq(accountDeletionRequests.ownerUserId, session.user.id),
  });

  if (existingRequest) {
    await db
      .update(accountDeletionRequests)
      .set({ token, expiresAt, completedAt: null })
      .where(eq(accountDeletionRequests.id, existingRequest.id));
  } else {
    await db.insert(accountDeletionRequests).values({
      ownerUserId: session.user.id,
      token,
      expiresAt,
    });
  }

  const mailSent = smtpConfigured
    ? await sendAccountDeletionEmail(session.user.email, deletionUrl)
    : false;

  if (!mailSent && smtpConfigured) {
    await writeUserAuditLog({
      user: session.user,
      action: "account_delete_requested",
      result: "failure",
      reason: "mail_send_failed",
      request,
    });
    return NextResponse.json(
      { error: "削除確認メールの送信に失敗しました。時間を置いて再度お試しください" },
      { status: 500 },
    );
  }

  await writeUserAuditLog({
    user: session.user,
    action: "account_delete_requested",
    result: "success",
    request,
    metadata: { previewEnabled, mailSent },
  });
  return NextResponse.json({
    success: true,
    previewUrl: previewEnabled ? deletionUrl : null,
  });
}
