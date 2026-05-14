// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accountDeletionRequests, users } from "@/db/schema";
import { buildExpiredAuthCookieOptions, AUTH_SESSION_COOKIE } from "@/lib/auth";
import { deleteOwnerAccount } from "@/lib/account-deletion";
import {
  clearDeviceAuthCookie,
  clearLegacyLastUserCookie,
} from "@/lib/device-auth";
import { isOwnerUser } from "@/lib/ownership";
import { StripeBillingError } from "@/lib/stripe-billing";

/** POST /api/auth/account-deletion/complete — delete an owner account by email token */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const deletionRequest = await db.query.accountDeletionRequests.findFirst({
    where: and(
      eq(accountDeletionRequests.token, token),
      isNull(accountDeletionRequests.completedAt),
      gt(accountDeletionRequests.expiresAt, now),
    ),
  });

  if (!deletionRequest) {
    return NextResponse.json(
      { error: "リンクが無効か、有効期限が切れています" },
      { status: 404 },
    );
  }

  const ownerUser = await db.query.users.findFirst({
    where: eq(users.id, deletionRequest.ownerUserId),
  });

  if (!ownerUser || !isOwnerUser(ownerUser)) {
    await db
      .delete(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, deletionRequest.id));

    return NextResponse.json(
      { error: "削除対象のOwnerアカウントが見つかりません" },
      { status: 404 },
    );
  }

  let summary;
  try {
    summary = await deleteOwnerAccount({
      ownerUserId: ownerUser.id,
      deletionRequestId: deletionRequest.id,
      ownerUser,
    });
  } catch (error) {
    if (error instanceof StripeBillingError) {
      return NextResponse.json(
        {
          error: "Stripeサブスクリプションのキャンセルに失敗しました。退会処理は完了していません。",
          code: error.code,
        },
        { status: error.status },
      );
    }

    console.error("[account-deletion] Failed to delete owner account", error);
    return NextResponse.json(
      { error: "アカウント削除に失敗しました" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ success: true, summary });
  response.cookies.set(AUTH_SESSION_COOKIE, "", buildExpiredAuthCookieOptions(request));
  clearDeviceAuthCookie(response, request);
  clearLegacyLastUserCookie(response, request);
  return response;
}
