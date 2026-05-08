// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

const OFFICIAL_SAAS_MODES = new Set(["official-saas", "saas"]);

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isEnabled(value: string | null | undefined) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isHttpsOrigin(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hasAll(names: string[]) {
  return names.every((name) => !!readEnv(name));
}

export function isOfficialSaasMode() {
  const mode = readEnv("KEINAGE_DEPLOYMENT_MODE")?.toLowerCase() ?? "";
  return OFFICIAL_SAAS_MODES.has(mode)
    || isEnabled(process.env.KEINAGE_OFFICIAL_SAAS);
}

export function validateProductionSecurityConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const officialSaas = isOfficialSaasMode();
  const failures: string[] = [];
  const warnings: string[] = [];
  const appPublicOrigin = readEnv("APP_PUBLIC_ORIGIN");

  if (!isHttpsOrigin(appPublicOrigin)) {
    const message = "APP_PUBLIC_ORIGIN must be an HTTPS public origin in production.";
    if (officialSaas) failures.push(message);
    else warnings.push(message);
  }

  if (officialSaas) {
    if (process.env.TRUST_PROXY_HEADERS !== "true") {
      failures.push("TRUST_PROXY_HEADERS=true is required behind the official SaaS proxy/CDN.");
    }
    if (process.env.BILLING_MODE !== "stripe") {
      failures.push("BILLING_MODE=stripe is required for official SaaS.");
    }
    if (process.env.PLAN_ENFORCEMENT_MODE !== "billing") {
      failures.push("PLAN_ENFORCEMENT_MODE=billing is required for official SaaS.");
    }
    if (!hasAll([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_LITE_MONTHLY",
      "STRIPE_PRICE_LITE_YEARLY",
      "STRIPE_PRICE_STANDARD_MONTHLY",
      "STRIPE_PRICE_STANDARD_YEARLY",
      "STRIPE_PRICE_STANDARD_PLUS_MONTHLY",
      "STRIPE_PRICE_STANDARD_PLUS_YEARLY",
    ])) {
      failures.push("Stripe secret, webhook secret, and all SaaS price IDs are required.");
    }
    if (process.env.GOOGLE_OAUTH_ENABLED !== "true" || !hasAll([
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
    ])) {
      failures.push("Google OAuth/OIDC must be enabled and fully configured.");
    }
    if (process.env.SUPER_OWNER_REQUIRE_GOOGLE !== "true") {
      failures.push("SUPER_OWNER_REQUIRE_GOOGLE=true is required for official SaaS.");
    }
    if (!hasAll(["S3_REGION", "S3_BUCKET"])) {
      failures.push("S3_REGION and S3_BUCKET are required for official SaaS media storage.");
    }
    if (process.env.STORAGE_DELIVERY_MODE !== "cloudfront-signed-url") {
      failures.push("STORAGE_DELIVERY_MODE=cloudfront-signed-url is required for official SaaS private media delivery.");
    }
    if (!hasAll([
      "STORAGE_CDN_BASE_URL",
      "CLOUDFRONT_KEY_PAIR_ID",
      "CLOUDFRONT_PRIVATE_KEY",
    ])) {
      failures.push("CloudFront signed URL settings are required for official SaaS.");
    }
  }

  for (const warning of warnings) {
    console.warn(`[security/config] ${warning}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Production security configuration is incomplete:\n- ${failures.join("\n- ")}`,
    );
  }
}
