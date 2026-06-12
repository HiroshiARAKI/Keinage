// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  findOpenWeatherCity,
  listOpenWeatherCountries,
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
    query: "Tokyo",
  });
  assert.ok(cities.some((city) => city.id === "1850147"));
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
