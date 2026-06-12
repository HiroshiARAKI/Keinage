// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { isBoardDisplayable } from "@/lib/board-status";
import { getOwnerSetting } from "@/lib/owner-settings";
import { isInOwnerScope, resolveOwnerUserId } from "@/lib/ownership";
import { findOpenWeatherCity } from "@/lib/weather/openweather-cities";
import { getWeatherProvider } from "@/lib/weather/provider";
import { getWeatherForecast } from "@/lib/weather/service";

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

  const provider = getWeatherProvider();
  let cityId = ownerUserId
    ? (await getOwnerSetting(ownerUserId, "weatherCityId")) ??
      provider.defaultLocationId
    : provider.defaultLocationId;
  if (
    provider.id === "openweatherapi" &&
    !(await findOpenWeatherCity(cityId))
  ) {
    cityId = provider.defaultLocationId;
  }

  if (!provider.isLocationId(cityId)) {
    return NextResponse.json(
      { error: "Invalid city ID" },
      { status: 400 },
    );
  }

  try {
    const result = await getWeatherForecast(cityId);
    return NextResponse.json(result.forecast, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=1740",
        "X-Weather-Cache": result.cacheStatus,
      },
    });
  } catch (error) {
    console.error("[weather] Failed to fetch forecast", {
      provider: provider.id,
      cityId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to fetch weather" },
      { status: provider.id === "openweatherapi" ? 503 : 502 },
    );
  }
}
