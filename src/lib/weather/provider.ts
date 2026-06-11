// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { TsukumijimaWeatherProvider } from "@/lib/weather/providers/tsukumijima";
import type { WeatherProvider } from "@/lib/weather/types";

const providers: Record<string, WeatherProvider> = {
  tsukumijima: new TsukumijimaWeatherProvider(),
};

export function getWeatherProvider(): WeatherProvider {
  const providerId = process.env.WEATHER_PROVIDER?.trim() || "tsukumijima";
  const provider = providers[providerId];
  if (!provider) {
    throw new Error(`Unsupported weather provider: ${providerId}`);
  }
  return provider;
}
