// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { WEATHER_AREAS } from "@/lib/weather-areas";

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
  displayName?: string;
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

interface OpenWeatherGeocodingLocation {
  name?: unknown;
  local_names?: Record<string, unknown>;
  lat?: unknown;
  lon?: unknown;
  country?: unknown;
  state?: unknown;
}

let citiesPromise: Promise<OpenWeatherCity[]> | null = null;
let allCitiesPromise: Promise<OpenWeatherCity[]> | null = null;
let cityIndexPromise: Promise<Map<string, OpenWeatherCity>> | null = null;
let cityNameIndexPromise: Promise<Map<string, OpenWeatherCity>> | null = null;
let allCityNameIndexPromise:
  | Promise<Map<string, OpenWeatherCity[]>>
  | null = null;
const japaneseCityNameCache = new Map<string, string>();
const japanesePrefectureSearchCache = new Map<string, OpenWeatherCity[]>();

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

function cityNameKey(country: string, name: string): string {
  return `${country}:${normalizeSearchText(name)}`;
}

function preferLargerCityId(
  cities: OpenWeatherCity[],
): OpenWeatherCity[] {
  const byName = new Map<string, OpenWeatherCity>();
  for (const city of cities) {
    const key = cityNameKey(city.country, city.name);
    const previous = byName.get(key);
    if (!previous || Number(city.id) > Number(previous.id)) {
      byName.set(key, city);
    }
  }
  return [...byName.values()];
}

async function loadAllCities(): Promise<OpenWeatherCity[]> {
  if (!allCitiesPromise) {
    allCitiesPromise = (async () => {
      const compressed = await readFile(CITY_LIST_PATH);
      const json = await gunzipAsync(compressed);
      const values = JSON.parse(json.toString("utf8")) as RawOpenWeatherCity[];
      return values
        .map(parseCity)
        .filter((city): city is OpenWeatherCity => city !== null);
    })();
  }
  return allCitiesPromise;
}

async function loadCities(): Promise<OpenWeatherCity[]> {
  if (!citiesPromise) {
    citiesPromise = loadAllCities().then(preferLargerCityId);
  }
  return citiesPromise;
}

async function getCityIndex() {
  if (!cityIndexPromise) {
    cityIndexPromise = loadAllCities().then(
      (cities) => new Map(cities.map((city) => [city.id, city])),
    );
  }
  return cityIndexPromise;
}

async function getCityNameIndex() {
  if (!cityNameIndexPromise) {
    cityNameIndexPromise = loadCities().then(
      (cities) => new Map(
        cities.map((city) => [cityNameKey(city.country, city.name), city]),
      ),
    );
  }
  return cityNameIndexPromise;
}

async function getAllCityNameIndex() {
  if (!allCityNameIndexPromise) {
    allCityNameIndexPromise = loadAllCities().then((cities) => {
      const index = new Map<string, OpenWeatherCity[]>();
      for (const city of cities) {
        const key = cityNameKey(city.country, city.name);
        index.set(key, [...(index.get(key) ?? []), city]);
      }
      return index;
    });
  }
  return allCityNameIndexPromise;
}

function geocodingUrl(
  endpoint: "direct" | "reverse",
  apiKey: string,
  params: Record<string, string>,
) {
  const url = new URL(`https://api.openweathermap.org/geo/1.0/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("appid", apiKey);
  return url;
}

async function fetchGeocodingLocations(
  url: URL,
): Promise<OpenWeatherGeocodingLocation[]> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function geographicDistanceSquared(
  city: OpenWeatherCity,
  location: OpenWeatherGeocodingLocation,
): number {
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Number.POSITIVE_INFINITY;
  }
  return (city.lat - lat) ** 2 + (city.lon - lon) ** 2;
}

function geocodingEnglishName(
  location: OpenWeatherGeocodingLocation,
): string {
  const localEnglish = location.local_names?.en;
  if (typeof localEnglish === "string" && localEnglish.trim()) {
    return localEnglish.trim();
  }
  return typeof location.name === "string" ? location.name.trim() : "";
}

function geocodingJapaneseName(
  location: OpenWeatherGeocodingLocation,
): string {
  const localJapanese = location.local_names?.ja;
  if (typeof localJapanese === "string" && localJapanese.trim()) {
    return localJapanese.trim();
  }
  return typeof location.name === "string" ? location.name.trim() : "";
}

function japanesePrefectureName(areaName: string): string {
  return areaName.startsWith("道") ? "北海道" : areaName;
}

function normalizeJapanesePrefecture(value: string): string {
  return value.trim().replace(/[都道府県]$/, "");
}

function matchingJapanesePrefectureCities(query: string) {
  const normalizedQuery = normalizeJapanesePrefecture(query);
  if (!normalizedQuery) return [];

  return WEATHER_AREAS.flatMap((area) => {
    const prefecture = japanesePrefectureName(area.name);
    return normalizeJapanesePrefecture(prefecture) === normalizedQuery
      ? area.cities.map((city) => ({
          name: city.name,
          prefecture,
        }))
      : [];
  }).filter(
    (city, index, cities) =>
      cities.findIndex(
        (candidate) =>
          candidate.name === city.name &&
          candidate.prefecture === city.prefecture,
      ) === index,
  );
}

async function mapGeocodingLocationsToJapaneseCities(
  locations: OpenWeatherGeocodingLocation[],
  cacheDisplayNames = true,
  preserveGeographicDuplicates = false,
): Promise<OpenWeatherCity[]> {
  const cityNameIndex = preserveGeographicDuplicates
    ? null
    : await getCityNameIndex();
  const allCityNameIndex = preserveGeographicDuplicates
    ? await getAllCityNameIndex()
    : null;
  const matches = new Map<
    string,
    { city: OpenWeatherCity; distance: number }
  >();

  for (const location of locations) {
    if (location.country !== "JP") continue;
    const englishName = geocodingEnglishName(location);
    const key = cityNameKey("JP", englishName);
    const city = preserveGeographicDuplicates
      ? (allCityNameIndex?.get(key) ?? [])
          .sort(
            (left, right) =>
              geographicDistanceSquared(left, location) -
              geographicDistanceSquared(right, location),
          )[0]
      : cityNameIndex?.get(key);
    if (!city) continue;
    const distance = geographicDistanceSquared(city, location);
    const previous = matches.get(city.id);
    if (!previous || distance < previous.distance) {
      const displayName = geocodingJapaneseName(location);
      if (cacheDisplayNames) {
        japaneseCityNameCache.set(city.id, displayName);
      }
      matches.set(city.id, {
        city: { ...city, displayName },
        distance,
      });
    }
  }

  return [...matches.values()]
    .sort((left, right) => left.distance - right.distance)
    .map(({ city }) => city);
}

export async function findOpenWeatherCity(
  cityId: string,
): Promise<OpenWeatherCity | null> {
  return (await getCityIndex()).get(cityId) ?? null;
}

export async function localizeJapaneseOpenWeatherCity(
  city: OpenWeatherCity,
  apiKey: string,
): Promise<OpenWeatherCity> {
  if (city.country !== "JP") return city;
  const cached = japaneseCityNameCache.get(city.id);
  if (cached) return { ...city, displayName: cached };

  let locations = await fetchGeocodingLocations(
    geocodingUrl("direct", apiKey, {
      q: `${city.name},JP`,
      limit: "5",
    }),
  );
  if (locations.length === 0) {
    locations = await fetchGeocodingLocations(
      geocodingUrl("reverse", apiKey, {
        lat: String(city.lat),
        lon: String(city.lon),
        limit: "5",
      }),
    );
  }
  const closest = locations
    .filter((location) => location.country === "JP")
    .sort(
      (left, right) =>
        geographicDistanceSquared(city, left) -
        geographicDistanceSquared(city, right),
    )[0];
  const displayName = closest
    ? geocodingJapaneseName(closest)
    : city.name;
  japaneseCityNameCache.set(city.id, displayName);
  return { ...city, displayName };
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

export async function searchJapaneseOpenWeatherCities(input: {
  query: string;
  apiKey: string;
}): Promise<OpenWeatherCity[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const prefectureCities = matchingJapanesePrefectureCities(query);
  if (prefectureCities.length > 0) {
    const cacheKey = normalizeJapanesePrefecture(query);
    const cached = japanesePrefectureSearchCache.get(cacheKey);
    if (cached) return cached;

    const locations = (
      await Promise.all(
        prefectureCities.map((city) =>
          fetchGeocodingLocations(
            geocodingUrl("direct", input.apiKey, {
              q: `${city.name},${city.prefecture},JP`,
              limit: "5",
            }),
          ).then((locations) => {
            const firstJapaneseLocation = locations.find(
              (location) => location.country === "JP",
            );
            return firstJapaneseLocation ? [firstJapaneseLocation] : [];
          }),
        ),
      )
    ).flat();
    const matchedCities = await mapGeocodingLocationsToJapaneseCities(
      locations,
      false,
      true,
    );
    const cities = await Promise.all(
      matchedCities.map((city) =>
        localizeJapaneseOpenWeatherCity(city, input.apiKey),
      ),
    );
    japanesePrefectureSearchCache.set(cacheKey, cities);
    return cities;
  }

  const locations = await fetchGeocodingLocations(
    geocodingUrl("direct", input.apiKey, {
      q: `${query},JP`,
      limit: "5",
    }),
  );
  return mapGeocodingLocationsToJapaneseCities(locations);
}
