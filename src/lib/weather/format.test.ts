// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWeatherFetchedAt,
  formatWeatherFetchedAtLabel,
} from "./format";

test("formats a weather fetch timestamp without seconds", () => {
  const formatted = formatWeatherFetchedAt(
    "2026-06-12T12:34:56.000Z",
    "en-US",
    { timeZone: "UTC" },
  );

  assert.ok(formatted);
  assert.match(formatted, /06\/12/);
  assert.match(formatted, /12:34/);
  assert.doesNotMatch(formatted, /:56/);
});

test("returns null for an invalid weather fetch timestamp", () => {
  assert.equal(formatWeatherFetchedAt("invalid", "ja-JP"), null);
});

test("places the update label after the timestamp in Japanese", () => {
  assert.equal(
    formatWeatherFetchedAtLabel("08/10 14:35", "更新", "ja-JP"),
    "08/10 14:35 更新",
  );
});

test("places the update label before the timestamp in other locales", () => {
  assert.equal(
    formatWeatherFetchedAtLabel("08/10, 02:35 PM", "Updated", "en-US"),
    "Updated 08/10, 02:35 PM",
  );
});
