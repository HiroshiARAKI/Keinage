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

test("Japanese geocoding localizes a selected city", async (t) => {
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

test("Japanese prefecture search returns cities in the matched prefecture index", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (input) => {
    const query = new URL(String(input)).searchParams.get("q") ?? "";
    if (query.startsWith("横浜,") || query.startsWith("Yokohama,")) {
      return Response.json([
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
      ]);
    }
    if (query.startsWith("小田原,") || query.startsWith("Odawara,")) {
      return Response.json([
        {
          name: "Odawara",
          local_names: { en: "Odawara", ja: "小田原市" },
          lat: 35.25556,
          lon: 139.15972,
          country: "JP",
        },
      ]);
    }
    return Response.json([]);
  });

  const cities = await searchJapaneseOpenWeatherCities({
    query: "神奈川県",
    apiKey: "test-key",
  });
  assert.deepEqual(
    cities.map((city) => city.id).sort(),
    ["1854747", "2127436"],
  );
  assert.ok(cities.some((city) => city.displayName === "横浜町"));
  assert.ok(cities.some((city) => city.displayName === "小田原市"));
  const callsAfterFirstSearch = fetchMock.mock.callCount();
  assert.ok(callsAfterFirstSearch >= 2);

  const cached = await searchJapaneseOpenWeatherCities({
    query: "神奈川",
    apiKey: "test-key",
  });
  assert.deepEqual(cached, cities);
  assert.equal(fetchMock.mock.callCount(), callsAfterFirstSearch);
});
