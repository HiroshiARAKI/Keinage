// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { resolveBoardDisplayAccessDecision } from "./board-display-authorization";

test("allows public boards without authentication", () => {
  assert.equal(
    resolveBoardDisplayAccessDecision({
      isPublic: true,
      hasSession: false,
      sessionInOwnerScope: false,
      hasRecentDeviceAccess: false,
    }),
    "allowed",
  );
});

test("allows private boards for an Owner-scoped session", () => {
  assert.equal(
    resolveBoardDisplayAccessDecision({
      isPublic: false,
      hasSession: true,
      sessionInOwnerScope: true,
      hasRecentDeviceAccess: false,
    }),
    "allowed",
  );
});

test("allows a recently active private display after its session expires", () => {
  assert.equal(
    resolveBoardDisplayAccessDecision({
      isPublic: false,
      hasSession: false,
      sessionInOwnerScope: false,
      hasRecentDeviceAccess: true,
    }),
    "allowed",
  );
});

test("rejects an unregistered private display without a session", () => {
  assert.equal(
    resolveBoardDisplayAccessDecision({
      isPublic: false,
      hasSession: false,
      sessionInOwnerScope: false,
      hasRecentDeviceAccess: false,
    }),
    "unauthorized",
  );
});

test("hides a private board from a session outside its Owner scope", () => {
  assert.equal(
    resolveBoardDisplayAccessDecision({
      isPublic: false,
      hasSession: true,
      sessionInOwnerScope: false,
      hasRecentDeviceAccess: false,
    }),
    "not-found",
  );
});
