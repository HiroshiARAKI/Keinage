// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { listOwnerSettings, upsertOwnerSettings } from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  assertCanSetImageMaxLongEdge,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";

/** GET /api/settings — get all settings as key-value object */
export async function GET() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  return NextResponse.json(
    await listOwnerSettings(resolveOwnerUserId(session.user)),
  );
}

/** PATCH /api/settings — upsert settings { key: value, ... } */
export async function PATCH(request: Request) {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const body = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const entries = Object.entries(body as Record<string, string>);
  const updates: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    updates[key] = value;
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  if (typeof updates.imageMaxLongEdge === "string") {
    const maxLongEdge = Number(updates.imageMaxLongEdge);
    if (!Number.isFinite(maxLongEdge) || maxLongEdge < 0) {
      return NextResponse.json({ error: "Invalid imageMaxLongEdge" }, { status: 400 });
    }

    try {
      await assertCanSetImageMaxLongEdge({
        ownerUserId,
        maxLongEdge,
      });
    } catch (error) {
      if (isPlanLimitError(error)) {
        return NextResponse.json(planLimitErrorBody(error), { status: 403 });
      }
      throw error;
    }
  }

  await upsertOwnerSettings(ownerUserId, updates);

  return NextResponse.json({ ok: true });
}
