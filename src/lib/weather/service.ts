// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getWeatherProvider } from "@/lib/weather/provider";
import type { WeatherForecast, WeatherProvider } from "@/lib/weather/types";

interface CachedWeather {
  data: WeatherForecast;
  expiresAt: number;
}

export interface WeatherResult {
  forecast: WeatherForecast;
  cacheStatus: "hit" | "miss" | "stale";
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function mergeSameDayForecast(
  cached: WeatherForecast,
  incoming: WeatherForecast,
): WeatherForecast {
  if (
    !hasText(cached.forecastDate) ||
    !hasText(incoming.forecastDate) ||
    cached.forecastDate !== incoming.forecastDate
  ) {
    return incoming;
  }

  const incomingPrecipitation = new Map(
    incoming.precipitation.map((period) => [
      `${period.startHour}-${period.endHour}`,
      period,
    ]),
  );
  const cachedPeriodKeys = new Set(
    cached.precipitation.map(
      (period) => `${period.startHour}-${period.endHour}`,
    ),
  );

  return {
    ...incoming,
    location: {
      name: hasText(incoming.location.name)
        ? incoming.location.name
        : cached.location.name,
      prefecture: incoming.location.prefecture ?? cached.location.prefecture,
      city: hasText(incoming.location.city)
        ? incoming.location.city
        : cached.location.city,
    },
    condition: {
      code: incoming.condition.code === "unknown"
        ? cached.condition.code
        : incoming.condition.code,
    },
    temperature: {
      maxCelsius:
        incoming.temperature.maxCelsius ?? cached.temperature.maxCelsius,
      minCelsius:
        incoming.temperature.minCelsius ?? cached.temperature.minCelsius,
    },
    precipitation: [
      ...cached.precipitation.map((previous) => {
        const current = incomingPrecipitation.get(
          `${previous.startHour}-${previous.endHour}`,
        );
        return current
          ? {
              ...current,
              probability: current.probability ?? previous.probability,
            }
          : previous;
      }),
      ...incoming.precipitation.filter(
        (period) => !cachedPeriodKeys.has(
          `${period.startHour}-${period.endHour}`,
        ),
      ),
    ],
  };
}

export class CachedWeatherProvider {
  private readonly weatherCache = new Map<string, CachedWeather>();
  private readonly inFlightRequests = new Map<string, Promise<WeatherForecast>>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly ttlMs = provider.cacheTtlMs,
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
    if (request && cached) {
      return { forecast: cached.data, cacheStatus: "stale" };
    }
    if (!request) {
      request = this.provider.fetchForecast(locationId);
      this.inFlightRequests.set(locationId, request);
    }

    try {
      const incoming = await request;
      const forecast = cached
        ? mergeSameDayForecast(cached.data, incoming)
        : incoming;
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
