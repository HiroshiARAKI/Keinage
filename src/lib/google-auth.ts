// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import {
  AUTH_SESSION_COOKIE,
  SESSION_MAX_AGE,
  buildAuthCookieOptions,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  clearLegacyLastUserCookie,
  setDeviceAuthCookie,
  storeDeviceFullAuth,
} from "@/lib/device-auth";
import {
  buildOidcAuthorizationUrl,
  createOidcFlowContext,
  fetchOidcUserInfo,
  type OidcProviderConfig,
  type OidcUserInfo,
} from "@/lib/oidc";
import { generateSessionToken } from "@/lib/pin";
import { buildPublicAppUrl } from "@/lib/public-origin";
import {
  resolveAuthenticatedLocale,
  setLocaleCookie,
} from "@/lib/locale-cookie";

export const GOOGLE_OAUTH_STATE_COOKIE = "google-oauth-state";
export const GOOGLE_OAUTH_STATE_MAX_AGE = 60 * 10;
export const GOOGLE_AUTH_PROVIDER = "google";
export const CREDENTIALS_AUTH_PROVIDER = "credentials";
const GOOGLE_OIDC_ISSUER = "https://accounts.google.com";
const GOOGLE_OIDC_SCOPES = ["openid", "email", "profile"];

export type GoogleAuthMode = "login" | "owner-signup" | "shared-signup";

export interface GoogleOAuthFlowContext {
  mode: GoogleAuthMode;
  redirectTo: string | null;
  sharedSignupToken: string | null;
  organizationName: string | null;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  nonce: string;
  expiresAt: string;
}

export type GoogleUserInfo = OidcUserInfo;

export function isGoogleAuthEnabled(): boolean {
  return (
    process.env.GOOGLE_OAUTH_ENABLED === "true" &&
    !!buildGoogleOidcProvider()
  );
}

export function buildGoogleRedirectUri(): string | null {
  return buildPublicAppUrl("/api/auth/google/callback");
}

function buildGoogleOidcProvider(): OidcProviderConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = buildGoogleRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) return null;

  return {
    id: GOOGLE_AUTH_PROVIDER,
    issuer: GOOGLE_OIDC_ISSUER,
    clientId,
    clientSecret,
    redirectUri,
    scopes: GOOGLE_OIDC_SCOPES,
    prompt: "select_account",
  };
}

export function createGoogleOAuthFlowContext(input: {
  mode: GoogleAuthMode;
  redirectTo?: string | null;
  sharedSignupToken?: string | null;
  organizationName?: string | null;
}): GoogleOAuthFlowContext {
  const flow = createOidcFlowContext(GOOGLE_OAUTH_STATE_MAX_AGE);

  return {
    mode: input.mode,
    redirectTo: input.redirectTo ?? null,
    sharedSignupToken: input.sharedSignupToken ?? null,
    organizationName: input.organizationName ?? null,
    ...flow,
  };
}

export async function buildGoogleAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
  nonce: string;
}): Promise<string | null> {
  const provider = buildGoogleOidcProvider();
  if (!provider) return null;

  return buildOidcAuthorizationUrl({
    provider,
    state: input.state,
    codeChallenge: input.codeChallenge,
    nonce: input.nonce,
  });
}

export async function fetchGoogleUserInfo(input: {
  code: string;
  codeVerifier: string;
  expectedNonce: string;
}): Promise<GoogleUserInfo | null> {
  const provider = buildGoogleOidcProvider();
  if (!provider) return null;

  return fetchOidcUserInfo({
    provider,
    code: input.code,
    codeVerifier: input.codeVerifier,
    expectedNonce: input.expectedNonce,
  });
}

export async function createSignedInResponse(input: {
  requestDeviceToken?: string;
  userId: string;
  redirectTo: string;
  setupSessionMaxAge?: number;
  locale?: string | null;
  acceptLanguage?: string | null;
}) {
  const now = new Date().toISOString();
  const sessionToken = generateSessionToken();
  const sessionMaxAge = input.setupSessionMaxAge ?? SESSION_MAX_AGE;
  const expiresAt = new Date(Date.now() + sessionMaxAge * 1000).toISOString();

  await db.insert(authSessions).values({
    userId: input.userId,
    sessionToken,
    expiresAt,
  });

  const { deviceToken } = await storeDeviceFullAuth({
    deviceToken: input.requestDeviceToken,
    userId: input.userId,
    authenticatedAt: now,
  });

  const response = NextResponse.redirect(input.redirectTo);
  response.cookies.set(
    AUTH_SESSION_COOKIE,
    sessionToken,
    buildAuthCookieOptions(sessionMaxAge),
  );
  setDeviceAuthCookie(response, deviceToken);
  setLocaleCookie(
    response,
    resolveAuthenticatedLocale({
      storedLocale: input.locale,
      acceptLanguage: input.acceptLanguage,
    }),
  );
  clearLegacyLastUserCookie(response);
  return response;
}

export function readDeviceTokenFromRequest(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_AUTH_COOKIE}=`))
    ?.slice(DEVICE_AUTH_COOKIE.length + 1);
}
