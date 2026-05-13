// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webauthnCredentials } from "@/db/schema";
import { getSessionUserAllowingWebAuthnPending } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  isWebAuthnEnabled,
  isWebAuthnOwnerRequired,
  isWebAuthnRequiredForUser,
} from "@/lib/webauthn";

export async function GET() {
  const session = await getSessionUserAllowingWebAuthnPending();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const credentials = isOwnerUser(session.user)
    ? await db
        .select({ id: webauthnCredentials.id })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, session.user.id))
    : [];

  return NextResponse.json({
    enabled: isWebAuthnEnabled(),
    ownerRequired: isWebAuthnOwnerRequired(),
    requiredForUser: isWebAuthnRequiredForUser(session.user),
    isOwner: isOwnerUser(session.user),
    verified: session.webauthnVerified,
    credentialCount: credentials.length,
  });
}
