// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_CITY_ID } from "@/lib/weather-areas";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import { getOwnerSetting } from "@/lib/owner-settings";
import { isInOwnerScope, resolveOwnerUserId } from "@/lib/ownership";

const WEATHER_API_BASE = "https://weather.tsukumijima.net/api/forecast/city";

/** Allowed city ID pattern: 6-digit number */
const CITY_ID_RE = /^\d{6}$/;

/** In-memory cache for weather data */
let weatherCache: { cityId: string; data: unknown; fetchedAt: number } | null =
  null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/** GET /api/weather — fetch today's weather for the configured city */
export async function GET(request: NextRequest) {
  const boardId = request.nextUrl.searchParams.get("boardId");

  let ownerUserId: string | null = null;

  if (boardId) {
    const board = await db.query.boards.findFirst({
      where: eq(boards.id, boardId),
    });
    if (!board || !isBoardDisplayable(board)) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    if (board.visibility === "private") {
      const session = await getSessionUser();
      if (!session) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }

      if (!isInOwnerScope(session.user, board.ownerUserId)) {
        return NextResponse.json({ error: "Board not found" }, { status: 404 });
      }
    }

    ownerUserId = board.ownerUserId;
  } else {
    const session = await getSessionUser();
    if (session) {
      ownerUserId = resolveOwnerUserId(session.user);
    } else {
      const firstUser = await db.query.users.findFirst();
      ownerUserId = firstUser ? resolveOwnerUserId(firstUser) : null;
    }
  }

  const cityId = ownerUserId
    ? (await getOwnerSetting(ownerUserId, "weatherCityId")) ?? DEFAULT_CITY_ID
    : DEFAULT_CITY_ID;

  if (!CITY_ID_RE.test(cityId)) {
    return NextResponse.json(
      { error: "Invalid city ID" },
      { status: 400 },
    );
  }

  // Return cache if valid
  if (
    weatherCache &&
    weatherCache.cityId === cityId &&
    Date.now() - weatherCache.fetchedAt < CACHE_TTL
  ) {
    return NextResponse.json(weatherCache.data);
  }

  try {
    const res = await fetch(`${WEATHER_API_BASE}/${cityId}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Weather API error" },
        { status: 502 },
      );
    }

    const full = await res.json();

    // Extract today's forecast only
    const today = full.forecasts?.[0];
    if (!today) {
      return NextResponse.json(
        { error: "No forecast data" },
        { status: 502 },
      );
    }

    const data = {
      location: full.location,
      telop: today.telop,
      image: today.image,
      chanceOfRain: today.chanceOfRain,
      temperature: today.temperature,
      date: today.date,
    };

    weatherCache = { cityId, data, fetchedAt: Date.now() };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch weather" },
      { status: 502 },
    );
  }
}
