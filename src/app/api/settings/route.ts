// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { getAdminSessionUser } from "@/lib/auth";
import { listOwnerSettings, upsertOwnerSettings } from "@/lib/owner-settings";
import { isOwnerUser, resolveOwnerUserId } from "@/lib/ownership";
import {
  assertCanSetImageMaxLongEdge,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";
import { emitSSE } from "@/lib/sse";
import { WEATHER_UPDATED_EVENT } from "@/lib/weather/events";
import { getWeatherProvider } from "@/lib/weather/provider";

const OWNER_ONLY_SETTING_KEYS = new Set(["authExpireDays"]);

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

  const containsOwnerOnlySetting = Object.keys(updates).some((key) =>
    OWNER_ONLY_SETTING_KEYS.has(key),
  );
  if (containsOwnerOnlySetting && !isOwnerUser(session.user)) {
    return NextResponse.json(
      { error: "この設定を変更できるのはOwnerのみです", code: "owner_required" },
      { status: 403 },
    );
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  if (
    typeof updates.weatherCityId === "string" &&
    !getWeatherProvider().isLocationId(updates.weatherCityId)
  ) {
    return NextResponse.json({ error: "Invalid weatherCityId" }, { status: 400 });
  }

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

  if (typeof updates.weatherCityId === "string") {
    const ownerBoards = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId));

    for (const board of ownerBoards) {
      emitSSE(board.id, WEATHER_UPDATED_EVENT);
    }
  }

  return NextResponse.json({ ok: true });
}
