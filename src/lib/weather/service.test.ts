// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  CachedWeatherProvider,
  mergeSameDayForecast,
} from "@/lib/weather/service";
import type {
  WeatherForecast,
  WeatherProvider,
} from "@/lib/weather/types";

function forecast(maxCelsius: number | null): WeatherForecast {
  return {
    provider: "test",
    locationId: "1",
    location: { name: "Tokyo", prefecture: null, city: "Tokyo" },
    condition: { code: "clear" },
    temperature: { maxCelsius, minCelsius: 10 },
    precipitation: [
      { startHour: 0, endHour: 6, probability: 10 },
      { startHour: 6, endHour: 12, probability: 20 },
      { startHour: 12, endHour: 18, probability: 30 },
      { startHour: 18, endHour: 24, probability: 40 },
    ],
    forecastDate: "2026-06-12",
    fetchedAt: "2026-06-12T00:00:00.000Z",
  };
}

test("same-day merge retains values omitted by a later response", () => {
  const incoming = forecast(null);
  incoming.precipitation[0].probability = null;

  const merged = mergeSameDayForecast(forecast(25), incoming);
  assert.equal(merged.temperature.maxCelsius, 25);
  assert.equal(merged.precipitation[0].probability, 10);
});

test("concurrent refresh returns stale cache without starting a duplicate request", async () => {
  let resolveRefresh: ((value: WeatherForecast) => void) | null = null;
  let calls = 0;
  const provider: WeatherProvider = {
    id: "test",
    defaultLocationId: "1",
    cacheTtlMs: 0,
    isLocationId: (value) => value === "1",
    fetchForecast: async () => {
      calls += 1;
      if (calls === 1) return forecast(20);
      return new Promise((resolve) => {
        resolveRefresh = resolve;
      });
    },
  };
  const cache = new CachedWeatherProvider(provider);
  await cache.getForecast("1");

  const refresh = cache.getForecast("1");
  const duplicate = await cache.getForecast("1");
  assert.equal(duplicate.cacheStatus, "stale");
  assert.equal(duplicate.forecast.temperature.maxCelsius, 20);
  assert.equal(calls, 2);

  assert.ok(resolveRefresh);
  resolveRefresh(forecast(30));
  const refreshed = await refresh;
  assert.equal(refreshed.cacheStatus, "miss");
  assert.equal(refreshed.forecast.temperature.maxCelsius, 30);
});

test("failed refresh falls back to expired cache", async () => {
  let calls = 0;
  const provider: WeatherProvider = {
    id: "test",
    defaultLocationId: "1",
    cacheTtlMs: 0,
    isLocationId: (value) => value === "1",
    fetchForecast: async () => {
      calls += 1;
      if (calls === 1) return forecast(20);
      throw new Error("upstream unavailable");
    },
  };
  const cache = new CachedWeatherProvider(provider);
  await cache.getForecast("1");

  const result = await cache.getForecast("1");
  assert.equal(result.cacheStatus, "stale");
  assert.equal(result.forecast.temperature.maxCelsius, 20);
});
