// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, authSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPin, needsPinRehash, verifyPin } from "@/lib/pin";
import { AUTH_SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import { sendSecurityNotification } from "@/lib/security-notifications";

/** PATCH /api/auth/pin/change — change PIN or email (requires active session) */
export async function PATCH(request: NextRequest) {
  // Verify session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const session = await db.query.authSessions.findFirst({
    where: eq(authSessions.sessionToken, sessionToken),
    with: { user: true },
  });
  if (!session || session.expiresAt < new Date().toISOString()) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const { action, currentPin, newPin, newEmail, newUserId } = body as {
    action: "verifyCurrentPin" | "changePin" | "setupPin" | "changeEmail" | "changeUserId";
    currentPin?: string;
    newPin?: string;
    newEmail?: string;
    newUserId?: string;
  };

  const adminUser = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  if (!adminUser) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  const adminUserId = adminUser.id;

  async function upgradeLegacyPinHashIfNeeded(currentHash: string, verifiedPin: string) {
    if (!needsPinRehash(currentHash)) {
      return;
    }

    await db
      .update(users)
      .set({ pinHash: await hashPin(verifiedPin) })
      .where(eq(users.id, adminUserId));
  }

  // ── setupPin: set initial PIN for a user who has none ──────────────────────
  if (action === "setupPin") {
    if (adminUser.pinHash) {
      return NextResponse.json(
        { error: "PINは既に設定されています。変更する場合はPIN変更を使用してください" },
        { status: 400 },
      );
    }
    if (!newPin || !/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { error: "PINは6桁の数字で入力してください" },
        { status: 400 },
      );
    }

    const pinHash = await hashPin(newPin);
    await db
      .update(users)
      .set({ pinHash })
      .where(eq(users.id, adminUserId));

    return NextResponse.json({ success: true });
  }

  if (action === "verifyCurrentPin") {
    if (!currentPin || !/^\d{6}$/.test(currentPin)) {
      return NextResponse.json(
        { error: "PINを正しく入力してください" },
        { status: 400 },
      );
    }
    if (!adminUser.pinHash || !(await verifyPin(currentPin, adminUser.pinHash))) {
      return NextResponse.json(
        { error: "PINが正しくありません" },
        { status: 401 },
      );
    }

    await upgradeLegacyPinHashIfNeeded(adminUser.pinHash, currentPin);
    return NextResponse.json({ success: true });
  }

  if (action === "changePin") {
    if (!currentPin || !/^\d{6}$/.test(currentPin)) {
      return NextResponse.json(
        { error: "現在のPINを正しく入力してください" },
        { status: 400 },
      );
    }
    if (!newPin || !/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { error: "新しいPINは6桁の数字で入力してください" },
        { status: 400 },
      );
    }

    if (!adminUser.pinHash || !(await verifyPin(currentPin, adminUser.pinHash))) {
      return NextResponse.json(
        { error: "現在のPINが正しくありません" },
        { status: 401 },
      );
    }

    const pinHash = await hashPin(newPin);
    await db
      .update(users)
      .set({ pinHash })
      .where(eq(users.id, adminUserId));

    return NextResponse.json({ success: true });
  }

  if (action === "changeEmail") {
    if (!newEmail || !newEmail.includes("@")) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください" },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({ email: newEmail })
      .where(eq(users.id, adminUserId));

    await sendSecurityNotification({
      user: adminUser,
      type: "email_changed",
      request,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "changeUserId") {
    if (!newUserId || !/^[a-zA-Z0-9_\-]{3,32}$/.test(newUserId)) {
      return NextResponse.json(
        { error: "ユーザーIDは3〜32文字の英数字・_・-のみ使用できます" },
        { status: 400 },
      );
    }

    // Check uniqueness
    const existing = await db.query.users.findFirst({
      where: eq(users.userId, newUserId),
    });
    if (existing && existing.id !== adminUser.id) {
      return NextResponse.json(
        { error: "このユーザーIDはすでに使用されています" },
        { status: 409 },
      );
    }

    await db
      .update(users)
      .set({ userId: newUserId })
      .where(eq(users.id, adminUserId));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "不正なアクションです" }, { status: 400 });
}
