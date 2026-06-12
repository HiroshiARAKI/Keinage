// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { getWeatherProvider } from "@/lib/weather/provider";

test("weather provider defaults to OpenWeather and supports the Japanese adapter", (t) => {
  const original = process.env.WEATHER_PROVIDER;
  t.after(() => {
    if (original === undefined) {
      delete process.env.WEATHER_PROVIDER;
    } else {
      process.env.WEATHER_PROVIDER = original;
    }
  });

  delete process.env.WEATHER_PROVIDER;
  assert.equal(getWeatherProvider().id, "openweatherapi");

  process.env.WEATHER_PROVIDER = "tenkiyoho_api_jp";
  assert.equal(getWeatherProvider().id, "tenkiyoho_api_jp");

  process.env.WEATHER_PROVIDER = "unsupported";
  assert.throws(getWeatherProvider, /Unsupported weather provider/);
});
