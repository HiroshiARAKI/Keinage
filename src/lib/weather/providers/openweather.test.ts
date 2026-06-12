// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { OpenWeatherProvider } from "@/lib/weather/providers/openweather";

const DAY_START = Date.UTC(2026, 5, 12) / 1000;

function hourlyEntry(hour: number) {
  return {
    dt: DAY_START + hour * 60 * 60,
    temp: hour + 1,
    pop: [0.2, 0.4, 0.6, 0.8][Math.floor(hour / 6)],
    weather: [{ id: 800 }],
  };
}

test("OpenWeather provider combines timeline pages into a daily forecast", async (t) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.endsWith("/current")) {
      return Response.json({
        timezone_offset: 0,
        data: [{
          dt: DAY_START + 12 * 60 * 60,
          temp: 18,
          weather: [{ id: 802 }],
        }],
      });
    }

    const start = Number(url.searchParams.get("start"));
    const firstHour = Math.round((start - DAY_START) / (60 * 60));
    const length = firstHour === 0 ? 20 : 4;
    return Response.json({
      timezone_offset: 0,
      data: Array.from({ length }, (_, index) =>
        hourlyEntry(firstHour + index)),
    });
  });

  const provider = new OpenWeatherProvider(
    async () => "test-key",
    async () => ({
      id: "1850147",
      name: "Tokyo",
      state: "",
      country: "JP",
      lat: 35.689499,
      lon: 139.691711,
    }),
    async (city) => ({ ...city, displayName: "東京都" }),
  );
  const forecast = await provider.fetchForecast("1850147");

  assert.equal(requests.length, 3);
  assert.ok(requests.every((url) => url.searchParams.get("units") === "metric"));
  assert.equal(forecast.condition.code, "partly-cloudy");
  assert.equal(forecast.location.name, "東京都");
  assert.equal(forecast.location.city, "東京都");
  assert.equal(forecast.forecastDate, "2026-06-12");
  assert.deepEqual(forecast.temperature, {
    maxCelsius: 24,
    minCelsius: 1,
  });
  assert.deepEqual(
    forecast.precipitation.map((period) => period.probability),
    [20, 40, 60, 80],
  );
});

test("OpenWeather provider fails before requesting data when the key is missing", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch should not be called");
  });
  const provider = new OpenWeatherProvider(
    async () => null,
    async () => ({
      id: "1850147",
      name: "Tokyo",
      state: "",
      country: "JP",
      lat: 35.689499,
      lon: 139.691711,
    }),
    async (city) => city,
  );

  await assert.rejects(
    provider.fetchForecast("1850147"),
    /API key is not configured/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("OpenWeather provider retains elapsed hourly data across same-day refreshes", async (t) => {
  let refresh = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/current")) {
      refresh += 1;
      return Response.json({
        timezone_offset: 0,
        data: [{
          dt: DAY_START + (refresh === 1 ? 6 : 14) * 60 * 60,
          temp: 18,
          weather: [{ id: 800 }],
        }],
      });
    }

    if (refresh === 1) {
      const start = Number(url.searchParams.get("start"));
      const firstHour = Math.round((start - DAY_START) / (60 * 60));
      const length = firstHour === 0 ? 20 : 4;
      return Response.json({
        data: Array.from({ length }, (_, index) => {
          const entry = hourlyEntry(firstHour + index);
          return {
            ...entry,
            temp: firstHour + index === 5 ? 30 : entry.temp,
          };
        }),
      });
    }

    return Response.json({
      data: Array.from({ length: 10 }, (_, index) => ({
        ...hourlyEntry(14 + index),
        temp: 20,
      })),
    });
  });

  const provider = new OpenWeatherProvider(
    async () => "test-key",
    async () => ({
      id: "1850147",
      name: "Tokyo",
      state: "",
      country: "JP",
      lat: 35.689499,
      lon: 139.691711,
    }),
    async (city) => city,
  );
  await provider.fetchForecast("1850147");
  const refreshed = await provider.fetchForecast("1850147");

  assert.equal(refreshed.temperature.maxCelsius, 30);
  assert.equal(refreshed.temperature.minCelsius, 1);
  assert.deepEqual(
    refreshed.precipitation.map((period) => period.probability),
    [20, 40, 60, 80],
  );
});
