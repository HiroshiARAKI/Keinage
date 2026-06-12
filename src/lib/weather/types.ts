// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "rain"
  | "snow"
  | "thunder"
  | "fog"
  | "unknown";

export interface WeatherPrecipitationPeriod {
  startHour: number;
  endHour: number;
  probability: number | null;
}

export interface WeatherForecast {
  provider: string;
  locationId: string;
  location: {
    name: string;
    prefecture: string | null;
    city: string;
  };
  condition: {
    code: WeatherCondition;
  };
  temperature: {
    maxCelsius: number | null;
    minCelsius: number | null;
  };
  precipitation: WeatherPrecipitationPeriod[];
  forecastDate: string;
  fetchedAt: string;
}

export interface WeatherProvider {
  readonly id: string;
  readonly defaultLocationId: string;
  readonly cacheTtlMs: number;
  isLocationId(value: string): boolean;
  fetchForecast(locationId: string): Promise<WeatherForecast>;
}
