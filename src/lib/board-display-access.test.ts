// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  readBoardDisplayDeviceKeyFromRequest,
  withBoardDisplayAccessQuery,
} from "./board-display-access";

test("adds a display device key to a board API URL", () => {
  assert.equal(
    withBoardDisplayAccessQuery("/api/weather?boardId=board-1", "device-1"),
    "/api/weather?boardId=board-1&displayDeviceKey=device-1",
  );
});

test("replaces an existing display device key", () => {
  assert.equal(
    withBoardDisplayAccessQuery(
      "/api/sse/board-1?displayDeviceKey=old#status",
      "new",
    ),
    "/api/sse/board-1?displayDeviceKey=new#status",
  );
});

test("leaves a URL unchanged while the device key is unavailable", () => {
  assert.equal(withBoardDisplayAccessQuery("/api/weather", null), "/api/weather");
});

test("reads a display device key from the request cookie", () => {
  const request = new Request("https://keinage.example/api/weather", {
    headers: { cookie: "other=value; keinage-display-device-key=device-cookie" },
  });
  assert.equal(
    readBoardDisplayDeviceKeyFromRequest(request),
    "device-cookie",
  );
});

test("prefers an explicit query key over the cookie", () => {
  const request = new Request(
    "https://keinage.example/api/weather?displayDeviceKey=device-query",
    { headers: { cookie: "keinage-display-device-key=device-cookie" } },
  );
  assert.equal(
    readBoardDisplayDeviceKeyFromRequest(request),
    "device-query",
  );
});
