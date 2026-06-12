// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type {
  WeatherCondition,
  WeatherForecast,
  WeatherProvider,
} from "@/lib/weather/types";

const WEATHER_API_BASE = "https://weather.tsukumijima.net/api/forecast/city";
const LOCATION_ID_RE = /^\d{6}$/;

interface TsukumijimaForecastResponse {
  location?: {
    area?: unknown;
    prefecture?: unknown;
    district?: unknown;
    city?: unknown;
  };
  forecasts?: Array<{
    date?: unknown;
    telop?: unknown;
    chanceOfRain?: Record<string, unknown>;
    temperature?: {
      min?: { celsius?: unknown };
      max?: { celsius?: unknown };
    };
  }>;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function celsiusValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function probabilityValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number.parseInt(String(value).replace("%", ""), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : null;
}

export function normalizeTsukumijimaCondition(telop: string): WeatherCondition {
  if (telop.includes("雷")) return "thunder";
  if (telop.includes("雪")) return "snow";
  if (telop.includes("雨")) return "rain";
  if (telop.includes("霧")) return "fog";
  if (telop.includes("晴") && (telop.includes("曇") || telop.includes("くもり"))) {
    return "partly-cloudy";
  }
  if (telop.includes("晴")) return "clear";
  if (telop.includes("曇") || telop.includes("くもり")) return "cloudy";
  return "unknown";
}

function displayLocation(location: NonNullable<TsukumijimaForecastResponse["location"]>) {
  const prefecture = stringValue(location.prefecture);
  const city = stringValue(location.city) || stringValue(location.district);
  const area = stringValue(location.area);
  return {
    name: [prefecture, city].filter(Boolean).join("") || area || city,
    prefecture: prefecture || null,
    city: city || area,
  };
}

export class TsukumijimaWeatherProvider implements WeatherProvider {
  readonly id = "tenkiyoho_api_jp";
  readonly defaultLocationId = "130010";
  readonly cacheTtlMs = 30 * 60 * 1000;

  isLocationId(value: string): boolean {
    return LOCATION_ID_RE.test(value);
  }

  async fetchForecast(locationId: string): Promise<WeatherForecast> {
    if (!this.isLocationId(locationId)) {
      throw new Error("Invalid weather location ID");
    }

    const response = await fetch(`${WEATHER_API_BASE}/${locationId}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Weather provider returned HTTP ${response.status}`);
    }

    const payload = await response.json() as TsukumijimaForecastResponse;
    const today = payload.forecasts?.[0];
    if (!today || !payload.location) {
      throw new Error("Weather provider returned no forecast");
    }

    const telop = stringValue(today.telop);
    const chanceOfRain = today.chanceOfRain ?? {};

    return {
      provider: this.id,
      locationId,
      location: displayLocation(payload.location),
      condition: {
        code: normalizeTsukumijimaCondition(telop),
      },
      temperature: {
        maxCelsius: celsiusValue(today.temperature?.max?.celsius),
        minCelsius: celsiusValue(today.temperature?.min?.celsius),
      },
      precipitation: [
        { startHour: 0, endHour: 6, probability: probabilityValue(chanceOfRain.T00_06) },
        { startHour: 6, endHour: 12, probability: probabilityValue(chanceOfRain.T06_12) },
        { startHour: 12, endHour: 18, probability: probabilityValue(chanceOfRain.T12_18) },
        { startHour: 18, endHour: 24, probability: probabilityValue(chanceOfRain.T18_24) },
      ],
      forecastDate: stringValue(today.date),
      fetchedAt: new Date().toISOString(),
    };
  }
}
