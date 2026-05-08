// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";

/** POST /api/owner/onboarding/acknowledge — mark owner welcome onboarding as seen */
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!isOwnerUser(session.user)) {
    return NextResponse.json({ error: "Owner権限が必要です" }, { status: 403 });
  }

  await db
    .update(users)
    .set({ ownerOnboardingAcknowledgedAt: new Date().toISOString() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
