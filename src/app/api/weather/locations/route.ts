// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { getWeatherProvider } from "@/lib/weather/provider";
import {
  findOpenWeatherCity,
  listOpenWeatherCountries,
  localizeJapaneseOpenWeatherCity,
  searchJapaneseOpenWeatherCities,
  searchOpenWeatherCities,
} from "@/lib/weather/openweather-cities";
import { getOpenWeatherApiKey } from "@/lib/weather/openweather-config";

export async function GET(request: NextRequest) {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const provider = getWeatherProvider();
  if (provider.id !== "openweatherapi") {
    return NextResponse.json({
      provider: provider.id,
      defaultLocationId: provider.defaultLocationId,
      countries: [],
      cities: [],
    });
  }

  const cityId = request.nextUrl.searchParams.get("id")?.trim();
  if (cityId) {
    const foundCity = await findOpenWeatherCity(cityId);
    const apiKey =
      foundCity?.country === "JP" ? await getOpenWeatherApiKey() : null;
    const city =
      foundCity && apiKey
        ? await localizeJapaneseOpenWeatherCity(foundCity, apiKey)
        : foundCity;
    return city
      ? NextResponse.json({
          provider: provider.id,
          defaultLocationId: provider.defaultLocationId,
          city,
        })
      : NextResponse.json({ error: "City not found" }, { status: 404 });
  }

  const country = request.nextUrl.searchParams.get("country")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (country || query) {
    const apiKey = country.toUpperCase() === "JP"
      ? await getOpenWeatherApiKey()
      : null;
    const localizedCities =
      apiKey
        ? await searchJapaneseOpenWeatherCities({ query, apiKey })
        : [];
    const cities =
      localizedCities.length > 0
        ? localizedCities
        : await searchOpenWeatherCities({ country, query });
    return NextResponse.json({
      provider: provider.id,
      defaultLocationId: provider.defaultLocationId,
      cities,
    });
  }

  return NextResponse.json({
    provider: provider.id,
    defaultLocationId: provider.defaultLocationId,
    countries: await listOpenWeatherCountries(),
  });
}
