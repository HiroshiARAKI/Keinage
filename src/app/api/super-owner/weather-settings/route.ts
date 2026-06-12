// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { upsertOwnerSettings } from "@/lib/owner-settings";
import {
  getOpenWeatherApiKey,
  OPENWEATHER_API_KEY_SETTING,
} from "@/lib/weather/openweather-config";
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

    await upsertOwnerSettings(session.user.id, {
      [OPENWEATHER_API_KEY_SETTING]: apiKey,
    });
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
