// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getWeatherProvider } from "@/lib/weather/provider";
import type { WeatherForecast, WeatherProvider } from "@/lib/weather/types";

export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedWeather {
  data: WeatherForecast;
  expiresAt: number;
}

export interface WeatherResult {
  forecast: WeatherForecast;
  cacheStatus: "hit" | "miss" | "stale";
}

export class CachedWeatherProvider {
  private readonly weatherCache = new Map<string, CachedWeather>();
  private readonly inFlightRequests = new Map<string, Promise<WeatherForecast>>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly ttlMs = WEATHER_CACHE_TTL_MS,
  ) {}

  async getForecast(locationId: string): Promise<WeatherResult> {
    if (!this.provider.isLocationId(locationId)) {
      throw new Error("Invalid weather location ID");
    }

    const now = Date.now();
    const cached = this.weatherCache.get(locationId);
    if (cached && cached.expiresAt > now) {
      return { forecast: cached.data, cacheStatus: "hit" };
    }

    let request = this.inFlightRequests.get(locationId);
    if (!request) {
      request = this.provider.fetchForecast(locationId);
      this.inFlightRequests.set(locationId, request);
    }

    try {
      const forecast = await request;
      this.weatherCache.set(locationId, {
        data: forecast,
        expiresAt: Date.now() + this.ttlMs,
      });
      return { forecast, cacheStatus: "miss" };
    } catch (error) {
      if (cached) {
        return { forecast: cached.data, cacheStatus: "stale" };
      }
      throw error;
    } finally {
      if (this.inFlightRequests.get(locationId) === request) {
        this.inFlightRequests.delete(locationId);
      }
    }
  }
}

const services = new Map<string, CachedWeatherProvider>();

export async function getWeatherForecast(locationId: string): Promise<WeatherResult> {
  const provider = getWeatherProvider();
  let service = services.get(provider.id);
  if (!service) {
    service = new CachedWeatherProvider(provider);
    services.set(provider.id, service);
  }
  return service.getForecast(locationId);
}
