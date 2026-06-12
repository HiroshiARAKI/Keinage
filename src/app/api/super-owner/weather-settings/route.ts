// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boards } from "@/db/schema";
import {
  getOwnerSetting,
  upsertOwnerSettings,
} from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import { emitSSE } from "@/lib/sse";
import { WEATHER_UPDATED_EVENT } from "@/lib/weather/events";
import { findOpenWeatherCity } from "@/lib/weather/openweather-cities";
import {
  getOpenWeatherApiKey,
  OPENWEATHER_API_KEY_SETTING,
} from "@/lib/weather/openweather-config";
import { OpenWeatherProvider } from "@/lib/weather/providers/openweather";
import {
  requireSuperOwner,
  SuperOwnerAuthError,
} from "@/lib/super-owner";

export async function GET(request: Request) {
  try {
    await requireSuperOwner(request, {
      auditAction: "openweather_settings_viewed",
    });
    return NextResponse.json({
      configured: Boolean(await getOpenWeatherApiKey()),
    });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSuperOwner(request, {
      auditAction: "openweather_settings_updated",
    });
    const body = await request.json() as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 256) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
    }

    const ownerUserId = resolveOwnerUserId(session.user);
    const currentCityId = await getOwnerSetting(ownerUserId, "weatherCityId");
    const weatherCityId =
      currentCityId && await findOpenWeatherCity(currentCityId)
        ? currentCityId
        : new OpenWeatherProvider().defaultLocationId;

    await upsertOwnerSettings(session.user.id, {
      [OPENWEATHER_API_KEY_SETTING]: apiKey,
    });
    await upsertOwnerSettings(ownerUserId, {
      weatherCityId,
    });

    const ownerBoards = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId));
    for (const board of ownerBoards) {
      emitSSE(board.id, WEATHER_UPDATED_EVENT);
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      weatherCityId,
    });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
