// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  findOpenWeatherCity,
  listOpenWeatherCountries,
  localizeJapaneseOpenWeatherCity,
  searchJapaneseOpenWeatherCities,
  searchOpenWeatherCities,
} from "@/lib/weather/openweather-cities";

test("OpenWeather city list resolves City IDs and supports country searches", async () => {
  const tokyo = await findOpenWeatherCity("1850147");
  assert.deepEqual(tokyo, {
    id: "1850147",
    name: "Tokyo",
    state: "",
    country: "JP",
    lat: 35.689499,
    lon: 139.691711,
  });

  const countries = await listOpenWeatherCountries();
  assert.deepEqual(
    countries.slice(0, 3).map((country) => country.code),
    ["JP", "US", "CN"],
  );
  assert.ok(countries.some((country) => country.code === "JP"));
  assert.ok(countries.some((country) => country.code === "US"));

  const cities = await searchOpenWeatherCities({
    country: "JP",
    query: "Yokohama",
  });
  assert.deepEqual(
    cities.map((city) => city.id),
    ["2127436"],
  );
});

test("OpenWeather city search requires a country and two query characters", async () => {
  assert.deepEqual(
    await searchOpenWeatherCities({ country: "", query: "Tokyo" }),
    [],
  );
  assert.deepEqual(
    await searchOpenWeatherCities({ country: "JP", query: "T" }),
    [],
  );
});

test("Japanese geocoding search maps localized names to the largest City ID", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([
    {
      name: "Yokohama",
      local_names: { en: "Yokohama", ja: "横浜市" },
      lat: 35.4503381,
      lon: 139.6343802,
      country: "JP",
    },
    {
      name: "Yokohama",
      local_names: { en: "Yokohama", ja: "横浜町" },
      lat: 41.0830879,
      lon: 141.2478217,
      country: "JP",
    },
  ]));

  const cities = await searchJapaneseOpenWeatherCities({
    query: "横浜",
    apiKey: "test-key",
  });
  assert.deepEqual(cities, [{
    id: "2127436",
    name: "Yokohama",
    displayName: "横浜町",
    state: "",
    country: "JP",
    lat: 41.083328,
    lon: 141.25,
  }]);
});

test("Japanese reverse geocoding localizes a selected city", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([
    {
      name: "Tokyo",
      local_names: { ja: "東京都" },
      lat: 35.6768601,
      lon: 139.7638947,
      country: "JP",
    },
  ]));
  const tokyo = await findOpenWeatherCity("1850147");
  assert.ok(tokyo);

  const localized = await localizeJapaneseOpenWeatherCity(
    tokyo,
    "test-key",
  );
  assert.equal(localized.displayName, "東京都");
});
