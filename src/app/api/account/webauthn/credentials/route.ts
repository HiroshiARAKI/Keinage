// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webauthnCredentials } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  isWebAuthnEnabled,
  isWebAuthnOwnerRequired,
} from "@/lib/webauthn";

export async function GET() {
  if (!isWebAuthnEnabled()) {
    return NextResponse.json({ enabled: false, credentials: [] });
  }

  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isOwnerUser(session.user)) {
    return NextResponse.json({ enabled: true, credentials: [] });
  }

  const credentials = await db
    .select({
      id: webauthnCredentials.id,
      name: webauthnCredentials.name,
      deviceType: webauthnCredentials.deviceType,
      backedUp: webauthnCredentials.backedUp,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, session.user.id));

  return NextResponse.json({
    enabled: true,
    ownerRequired: isWebAuthnOwnerRequired(),
    credentials,
  });
}

export async function DELETE(request: NextRequest) {
  if (!isWebAuthnEnabled()) {
    return NextResponse.json({ error: "Passkey認証は無効です" }, { status: 404 });
  }

  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isOwnerUser(session.user)) {
    return NextResponse.json({ error: "Ownerアカウントのみ利用できます" }, { status: 403 });
  }

  const { id } = await request.json() as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "Passkey ID が必要です" }, { status: 400 });
  }

  const credentials = await db
    .select({ id: webauthnCredentials.id })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, session.user.id));

  if (isWebAuthnOwnerRequired() && credentials.length <= 1) {
    return NextResponse.json(
      { error: "必須設定のため、最後のPasskeyは削除できません。" },
      { status: 400 },
    );
  }

  await db
    .delete(webauthnCredentials)
    .where(
      and(
        eq(webauthnCredentials.id, id),
        eq(webauthnCredentials.userId, session.user.id),
      ),
    );

  return NextResponse.json({ success: true });
}
