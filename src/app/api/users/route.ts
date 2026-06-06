// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sharedSignupRequests, users } from "@/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { resolveOwnerUserId } from "@/lib/ownership";
import { isSmtpConfigured, sendSharedSignupEmail } from "@/lib/mail";
import {
  buildPublicAppUrl,
  isUnauthenticatedSignupPreviewEnabled,
} from "@/lib/public-origin";
import {
  computeSignupExpiry,
  generateSignupToken,
  isValidSignupEmail,
  isValidSignupUserId,
  normalizeSignupEmail,
} from "@/lib/signup";
import {
  assertCanInviteSharedUser,
  getSharedUserPlanUsage,
  SharedUserLimitError,
  sharedUserLimitErrorBody,
  withSharedUserPlanLock,
} from "@/lib/shared-user-plan";

/** GET /api/users — list all users (admin only) */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const allUsers = await db
    .select({
      id: users.id,
      userId: users.userId,
      email: users.email,
      attribute: users.attribute,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.ownerUserId, resolveOwnerUserId(session.user)))
    .orderBy(users.createdAt);

  const ownerUserId = resolveOwnerUserId(session.user);
  const ownerUser = await db.query.users.findFirst({ where: eq(users.id, ownerUserId) });
  const scopedUsers = ownerUser ? [
    {
      id: ownerUser.id,
      userId: ownerUser.userId,
      email: ownerUser.email,
      attribute: ownerUser.attribute,
      role: ownerUser.role,
      status: ownerUser.status,
      createdAt: ownerUser.createdAt,
    },
    ...allUsers.filter((user) => user.id !== ownerUser.id),
  ] : allUsers;

  const now = new Date().toISOString();
  const [invitations, usage] = await Promise.all([
    db
      .select({
        id: sharedSignupRequests.id,
        userId: sharedSignupRequests.userId,
        email: sharedSignupRequests.email,
        role: sharedSignupRequests.role,
        status: sharedSignupRequests.status,
        expiresAt: sharedSignupRequests.expiresAt,
        createdAt: sharedSignupRequests.createdAt,
      })
      .from(sharedSignupRequests)
      .where(and(
        eq(sharedSignupRequests.ownerUserId, ownerUserId),
        isNull(sharedSignupRequests.completedAt),
        gt(sharedSignupRequests.expiresAt, now),
      ))
      .orderBy(sharedSignupRequests.createdAt),
    getSharedUserPlanUsage(ownerUserId),
  ]);

  return NextResponse.json({ users: scopedUsers, invitations, usage });
}

/** POST /api/users — invite a new shared user (admin only) */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, email, role } = body as {
    userId?: string;
    email?: string;
    role?: string;
  };

  const normalizedUserId = userId?.trim() ?? "";
  const normalizedEmail = email ? normalizeSignupEmail(email) : "";

  if (!normalizedUserId || !normalizedEmail) {
    return NextResponse.json(
      { error: "ユーザーID・メールアドレスは必須です" },
      { status: 400 },
    );
  }
  if (!isValidSignupUserId(normalizedUserId)) {
    return NextResponse.json(
      { error: "ユーザーIDは3〜32文字の英数字・_・-のみ使用できます" },
      { status: 400 },
    );
  }
  if (!isValidSignupEmail(normalizedEmail)) {
    return NextResponse.json(
      { error: "有効なメールアドレスを入力してください" },
      { status: 400 },
    );
  }
  const normalizedRole = role === "admin" ? "admin" : "general";

  // Check uniqueness
  const existing = await db.query.users.findFirst({
    where: or(eq(users.userId, normalizedUserId), eq(users.email, normalizedEmail)),
  });
  if (existing?.userId === normalizedUserId) {
    return NextResponse.json(
      { error: "このユーザーIDはすでに使用されています" },
      { status: 409 },
    );
  }
  if (existing?.email === normalizedEmail) {
    return NextResponse.json(
      { error: "このメールアドレスはすでに使用されています" },
      { status: 409 },
    );
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  const now = new Date().toISOString();
  const pendingInvite = await db.query.sharedSignupRequests.findFirst({
    where: and(
      isNull(sharedSignupRequests.completedAt),
      gt(sharedSignupRequests.expiresAt, now),
      or(
        eq(sharedSignupRequests.userId, normalizedUserId),
        eq(sharedSignupRequests.email, normalizedEmail),
      ),
    ),
  });
  if (pendingInvite) {
    return NextResponse.json(
      { error: "同じユーザーIDまたはメールアドレスの招待が既に発行されています" },
      { status: 409 },
    );
  }

  const smtpConfigured = isSmtpConfigured();
  const previewEnabled = isUnauthenticatedSignupPreviewEnabled();
  if (!smtpConfigured && !previewEnabled) {
    return NextResponse.json(
      { error: "この環境では招待リンクを発行できません。SMTP を設定してください" },
      { status: 503 },
    );
  }

  const token = generateSignupToken();
  const signupUrl = buildPublicAppUrl(`/signup/shared?token=${encodeURIComponent(token)}`);
  if (!signupUrl) {
    return NextResponse.json(
      { error: "APP_PUBLIC_ORIGIN が未設定、または不正です" },
      { status: 503 },
    );
  }

  let signupRequest: typeof sharedSignupRequests.$inferSelect;
  try {
    signupRequest = await withSharedUserPlanLock(ownerUserId, async (transaction) => {
      await assertCanInviteSharedUser(ownerUserId, transaction);
      const [created] = await transaction.insert(sharedSignupRequests).values({
        ownerUserId,
        userId: normalizedUserId,
        email: normalizedEmail,
        role: normalizedRole,
        status: "invited",
        token,
        expiresAt: computeSignupExpiry(),
      }).returning();
      return created;
    });
  } catch (error) {
    if (error instanceof SharedUserLimitError) {
      return NextResponse.json(sharedUserLimitErrorBody(error), { status: 403 });
    }
    throw error;
  }

  const mailSent = smtpConfigured
    ? await sendSharedSignupEmail(normalizedEmail, signupUrl)
    : false;

  if (!mailSent && smtpConfigured) {
    await db
      .delete(sharedSignupRequests)
      .where(eq(sharedSignupRequests.id, signupRequest.id));
    return NextResponse.json(
      { error: "招待メールの送信に失敗しました。時間を置いて再度お試しください" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: signupRequest.id,
    userId: normalizedUserId,
    email: normalizedEmail,
    invited: true,
    role: normalizedRole,
    previewUrl: previewEnabled ? signupUrl : null,
  }, { status: 201 });
}
