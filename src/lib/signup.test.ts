// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  getOwnerSignupMode,
  isOwnerSignupAllowedForEmail,
  isOwnerSignupEnabled,
} from "./signup";

const originalEnv = {
  OWNER_SIGNUP_MODE: process.env.OWNER_SIGNUP_MODE,
  SUPER_OWNER_BOOTSTRAP_ENABLED: process.env.SUPER_OWNER_BOOTSTRAP_ENABLED,
  SUPER_OWNER_EMAIL: process.env.SUPER_OWNER_EMAIL,
  SUPER_OWNER_REQUIRE_GOOGLE: process.env.SUPER_OWNER_REQUIRE_GOOGLE,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv("OWNER_SIGNUP_MODE");
  restoreEnv("SUPER_OWNER_BOOTSTRAP_ENABLED");
  restoreEnv("SUPER_OWNER_EMAIL");
  restoreEnv("SUPER_OWNER_REQUIRE_GOOGLE");
});

describe("Owner signup policy", () => {
  test("keeps public Owner signup open when the mode is unset", () => {
    delete process.env.OWNER_SIGNUP_MODE;

    assert.equal(getOwnerSignupMode(), "open");
    assert.equal(isOwnerSignupEnabled(), true);
    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "credentials"), true);
  });

  test("allows only the configured Super Owner during bootstrap", () => {
    process.env.OWNER_SIGNUP_MODE = "super-owner-only";
    process.env.SUPER_OWNER_BOOTSTRAP_ENABLED = "true";
    process.env.SUPER_OWNER_EMAIL = "Owner@Example.com";

    assert.equal(isOwnerSignupEnabled(), true);
    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "credentials"), true);
    assert.equal(isOwnerSignupAllowedForEmail("family@example.com", "credentials"), false);
  });

  test("closes Super Owner signup after bootstrap is disabled", () => {
    process.env.OWNER_SIGNUP_MODE = "super-owner-only";
    process.env.SUPER_OWNER_BOOTSTRAP_ENABLED = "false";
    process.env.SUPER_OWNER_EMAIL = "owner@example.com";

    assert.equal(isOwnerSignupEnabled(), false);
    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "credentials"), false);
  });

  test("fails closed for an unknown explicit mode", () => {
    process.env.OWNER_SIGNUP_MODE = "typo";

    assert.equal(getOwnerSignupMode(), "disabled");
    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "credentials"), false);
  });

  test("rejects credential signup when Super Owner requires Google", () => {
    process.env.OWNER_SIGNUP_MODE = "super-owner-only";
    process.env.SUPER_OWNER_BOOTSTRAP_ENABLED = "true";
    process.env.SUPER_OWNER_EMAIL = "owner@example.com";
    process.env.SUPER_OWNER_REQUIRE_GOOGLE = "true";

    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "credentials"), false);
    assert.equal(isOwnerSignupAllowedForEmail("owner@example.com", "google"), true);
  });
});
