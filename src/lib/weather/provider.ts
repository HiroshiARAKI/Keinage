// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { OpenWeatherProvider } from "@/lib/weather/providers/openweather";
import { TsukumijimaWeatherProvider } from "@/lib/weather/providers/tsukumijima";
import type { WeatherProvider } from "@/lib/weather/types";

const openWeatherProvider = new OpenWeatherProvider();
const tenkiyohoProvider = new TsukumijimaWeatherProvider();
const providers: Record<string, WeatherProvider> = {
  openweatherapi: openWeatherProvider,
  tenkiyoho_api_jp: tenkiyohoProvider,
};

export function getWeatherProvider(): WeatherProvider {
  const providerId =
    process.env.WEATHER_PROVIDER?.trim() || "openweatherapi";
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unsupported weather provider: ${providerId}`);
  }
  return provider;
}
