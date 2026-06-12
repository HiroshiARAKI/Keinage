// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const gunzipAsync = promisify(gunzip);
const FEATURED_COUNTRY_CODES = ["JP", "US", "CN"];
const CITY_LIST_PATH = path.join(
  process.cwd(),
  "resources",
  "openweather",
  "city.list.json.gz",
);

export interface OpenWeatherCity {
  id: string;
  name: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
}

interface RawOpenWeatherCity {
  id?: unknown;
  name?: unknown;
  state?: unknown;
  country?: unknown;
  coord?: {
    lat?: unknown;
    lon?: unknown;
  };
}

let citiesPromise: Promise<OpenWeatherCity[]> | null = null;
let cityIndexPromise: Promise<Map<string, OpenWeatherCity>> | null = null;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function parseCity(value: RawOpenWeatherCity): OpenWeatherCity | null {
  const id = typeof value.id === "number" || typeof value.id === "string"
    ? String(value.id)
    : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const state = typeof value.state === "string" ? value.state.trim() : "";
  const country =
    typeof value.country === "string"
      ? value.country.trim().toUpperCase()
      : "";
  const lat = Number(value.coord?.lat);
  const lon = Number(value.coord?.lon);

  if (
    !/^\d+$/.test(id) ||
    !name ||
    !/^[A-Z]{2}$/.test(country) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return { id, name, state, country, lat, lon };
}

async function loadCities(): Promise<OpenWeatherCity[]> {
  if (!citiesPromise) {
    citiesPromise = (async () => {
      const compressed = await readFile(CITY_LIST_PATH);
      const json = await gunzipAsync(compressed);
      const values = JSON.parse(json.toString("utf8")) as RawOpenWeatherCity[];
      return values
        .map(parseCity)
        .filter((city): city is OpenWeatherCity => city !== null);
    })();
  }
  return citiesPromise;
}

async function getCityIndex() {
  if (!cityIndexPromise) {
    cityIndexPromise = loadCities().then(
      (cities) => new Map(cities.map((city) => [city.id, city])),
    );
  }
  return cityIndexPromise;
}

export async function findOpenWeatherCity(
  cityId: string,
): Promise<OpenWeatherCity | null> {
  return (await getCityIndex()).get(cityId) ?? null;
}

export async function listOpenWeatherCountries(): Promise<
  Array<{ code: string; count: number }>
> {
  const counts = new Map<string, number>();
  for (const city of await loadCities()) {
    counts.set(city.country, (counts.get(city.country) ?? 0) + 1);
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => {
      const leftRank = FEATURED_COUNTRY_CODES.indexOf(left.code);
      const rightRank = FEATURED_COUNTRY_CODES.indexOf(right.code);
      if (leftRank !== -1 || rightRank !== -1) {
        if (leftRank === -1) return 1;
        if (rightRank === -1) return -1;
        return leftRank - rightRank;
      }
      return left.code.localeCompare(right.code);
    });
}

export async function searchOpenWeatherCities(input: {
  country: string;
  query: string;
  limit?: number;
}): Promise<OpenWeatherCity[]> {
  const country = input.country.trim().toUpperCase();
  const query = normalizeSearchText(input.query.trim());
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  if (!/^[A-Z]{2}$/.test(country) || query.length < 2) return [];

  return (await loadCities())
    .filter((city) => {
      if (city.country !== country) return false;
      return normalizeSearchText(`${city.state} ${city.name}`).includes(query);
    })
    .sort((left, right) => {
      const state = left.state.localeCompare(right.state);
      return state || left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}
