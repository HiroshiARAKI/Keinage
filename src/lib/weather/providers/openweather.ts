// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { findOpenWeatherCity } from "@/lib/weather/openweather-cities";
import { getOpenWeatherApiKey } from "@/lib/weather/openweather-config";
import type {
  WeatherCondition,
  WeatherForecast,
  WeatherProvider,
} from "@/lib/weather/types";

const OPENWEATHER_API_BASE =
  "https://api.openweathermap.org/data/4.0/onecall";
const LOCATION_ID_RE = /^\d+$/;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

interface OpenWeatherEntry {
  dt?: unknown;
  temp?: unknown;
  pop?: unknown;
  weather?: Array<{
    id?: unknown;
    icon?: unknown;
  }>;
}

interface OpenWeatherResponse {
  timezone_offset?: unknown;
  data?: OpenWeatherEntry[];
}

interface OpenWeatherDailyCache {
  cityId: string;
  lat: number;
  lon: number;
  date: string;
  currentResponse: OpenWeatherResponse;
  timelineResponses: OpenWeatherResponse[];
  timelineEntries: OpenWeatherEntry[];
  fetchedAt: string;
  expiresAt: number;
}

function numericValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionCode(entry: OpenWeatherEntry | undefined): WeatherCondition {
  const id = numericValue(entry?.weather?.[0]?.id);
  if (id === null) return "unknown";
  if (id >= 200 && id < 300) return "thunder";
  if (id === 511 || (id >= 600 && id < 700)) return "snow";
  if (id >= 300 && id < 600) return "rain";
  if (id >= 700 && id < 800) return "fog";
  if (id === 800) return "clear";
  if (id === 801 || id === 802) return "partly-cloudy";
  if (id === 803 || id === 804) return "cloudy";
  return "unknown";
}

function localDate(timestamp: number, timezoneOffset: number): string {
  return new Date((timestamp + timezoneOffset) * 1000)
    .toISOString()
    .slice(0, 10);
}

function localHour(timestamp: number, timezoneOffset: number): number {
  return new Date((timestamp + timezoneOffset) * 1000).getUTCHours();
}

function startOfLocalDay(timestamp: number, timezoneOffset: number): number {
  return (
    Math.floor((timestamp + timezoneOffset) / DAY_SECONDS) * DAY_SECONDS -
    timezoneOffset
  );
}

function buildUrl(
  endpoint: "current" | "timeline/1h",
  input: {
    lat: number;
    lon: number;
    apiKey: string;
    start?: number;
  },
) {
  const url = new URL(`${OPENWEATHER_API_BASE}/${endpoint}`);
  url.searchParams.set("lat", String(input.lat));
  url.searchParams.set("lon", String(input.lon));
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "en");
  url.searchParams.set("appid", input.apiKey);
  if (input.start !== undefined) {
    url.searchParams.set("start", String(input.start));
  }
  return url;
}

async function fetchOpenWeather(
  endpoint: "current" | "timeline/1h",
  input: {
    lat: number;
    lon: number;
    apiKey: string;
    start?: number;
  },
): Promise<OpenWeatherResponse> {
  const response = await fetch(buildUrl(endpoint, input), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OpenWeather returned HTTP ${response.status}`);
  }
  return response.json() as Promise<OpenWeatherResponse>;
}

function precipitationPeriods(
  entries: OpenWeatherEntry[],
  timezoneOffset: number,
) {
  return [
    { startHour: 0, endHour: 6 },
    { startHour: 6, endHour: 12 },
    { startHour: 12, endHour: 18 },
    { startHour: 18, endHour: 24 },
  ].map((period) => {
    const probabilities = entries
      .filter((entry) => {
        const timestamp = numericValue(entry.dt);
        if (timestamp === null) return false;
        const hour = localHour(timestamp, timezoneOffset);
        return hour >= period.startHour && hour < period.endHour;
      })
      .map((entry) => numericValue(entry.pop))
      .filter((value): value is number => value !== null)
      .map((value) => Math.round(Math.min(Math.max(value, 0), 1) * 100));

    return {
      ...period,
      probability:
        probabilities.length > 0 ? Math.max(...probabilities) : null,
    };
  });
}

export class OpenWeatherProvider implements WeatherProvider {
  readonly id = "openweatherapi";
  readonly defaultLocationId = "1850147";
  readonly cacheTtlMs = 60 * 60 * 1000;
  private readonly dailyCache = new Map<string, OpenWeatherDailyCache>();

  constructor(
    private readonly apiKeyResolver = getOpenWeatherApiKey,
    private readonly cityResolver = findOpenWeatherCity,
  ) {}

  isLocationId(value: string): boolean {
    return LOCATION_ID_RE.test(value);
  }

  async fetchForecast(locationId: string): Promise<WeatherForecast> {
    if (!this.isLocationId(locationId)) {
      throw new Error("Invalid OpenWeather city ID");
    }

    const [apiKey, city] = await Promise.all([
      this.apiKeyResolver(),
      this.cityResolver(locationId),
    ]);
    if (!apiKey) throw new Error("OpenWeather API key is not configured");
    if (!city) throw new Error("OpenWeather city ID was not found");

    const current = await fetchOpenWeather("current", {
      lat: city.lat,
      lon: city.lon,
      apiKey,
    });
    const currentEntry = current.data?.[0];
    const currentTimestamp = numericValue(currentEntry?.dt);
    const timezoneOffset = numericValue(current.timezone_offset) ?? 0;
    if (!currentEntry || currentTimestamp === null) {
      throw new Error("OpenWeather returned no current weather");
    }

    const dayStart = startOfLocalDay(currentTimestamp, timezoneOffset);
    const firstTimeline = await fetchOpenWeather("timeline/1h", {
      lat: city.lat,
      lon: city.lon,
      apiKey,
      start: dayStart,
    });
    const firstEntries = firstTimeline.data ?? [];
    const lastTimestamp = numericValue(firstEntries.at(-1)?.dt);
    let timelineEntries = firstEntries;
    const timelineResponses = [firstTimeline];

    if (
      lastTimestamp !== null &&
      lastTimestamp < dayStart + DAY_SECONDS - HOUR_SECONDS
    ) {
      const secondTimeline = await fetchOpenWeather("timeline/1h", {
        lat: city.lat,
        lon: city.lon,
        apiKey,
        start: lastTimestamp + HOUR_SECONDS,
      });
      timelineResponses.push(secondTimeline);
      timelineEntries = [...timelineEntries, ...(secondTimeline.data ?? [])];
    }

    const forecastDate = localDate(currentTimestamp, timezoneOffset);
    const cacheKey = `${this.id}:${locationId}:${forecastDate}`;
    const previous = this.dailyCache.get(cacheKey);
    if (previous) {
      timelineEntries = [...previous.timelineEntries, ...timelineEntries];
    }
    const dayEntries = [
      ...new Map(
        timelineEntries
          .filter((entry) => {
            const timestamp = numericValue(entry.dt);
            return (
              timestamp !== null &&
              localDate(timestamp, timezoneOffset) === forecastDate
            );
          })
          .map((entry) => [String(entry.dt), entry]),
      ).values(),
    ].sort((left, right) => {
      return (numericValue(left.dt) ?? 0) - (numericValue(right.dt) ?? 0);
    });
    const fetchedAt = new Date().toISOString();
    for (const key of this.dailyCache.keys()) {
      if (key.startsWith(`${this.id}:${locationId}:`) && key !== cacheKey) {
        this.dailyCache.delete(key);
      }
    }
    this.dailyCache.set(cacheKey, {
      cityId: locationId,
      lat: city.lat,
      lon: city.lon,
      date: forecastDate,
      currentResponse: current,
      timelineResponses,
      timelineEntries: dayEntries,
      fetchedAt,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    const temperatures = dayEntries
      .map((entry) => numericValue(entry.temp))
      .filter((value): value is number => value !== null);

    return {
      provider: this.id,
      locationId,
      location: {
        name: [city.name, city.state, city.country].filter(Boolean).join(", "),
        prefecture: city.state || null,
        city: city.name,
      },
      condition: {
        code: conditionCode(currentEntry),
      },
      temperature: {
        maxCelsius:
          temperatures.length > 0 ? Math.max(...temperatures) : null,
        minCelsius:
          temperatures.length > 0 ? Math.min(...temperatures) : null,
      },
      precipitation: precipitationPeriods(dayEntries, timezoneOffset),
      forecastDate,
      fetchedAt,
    };
  }
}
