// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { googleOAuthFlows, sharedSignupRequests } from "@/db/schema";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE,
  buildGoogleAuthorizationUrl,
  createGoogleOAuthFlowContext,
  isGoogleAuthEnabled,
  type GoogleAuthMode,
} from "@/lib/google-auth";
import { buildAuthCookieOptions } from "@/lib/auth";
import { getPublicAppOrigin } from "@/lib/public-origin";
import {
  buildRateLimitKey,
  consumeRateLimit,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  isValidOrganizationName,
  normalizeOrganizationName,
} from "@/lib/signup";

const GOOGLE_OAUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const GOOGLE_OAUTH_RATE_LIMIT_MAX = 30;

function isAllowedRedirectTo(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

async function createAuthorization(input: {
  mode: GoogleAuthMode;
  redirectTo?: string | null;
  sharedSignupToken?: string | null;
  organizationName?: string | null;
}) {
  const flow = createGoogleOAuthFlowContext(input);
  const authorizationUrl = await buildGoogleAuthorizationUrl({
    state: flow.state,
    codeChallenge: flow.codeChallenge,
    nonce: flow.nonce,
  });
  if (!authorizationUrl) {
    return null;
  }

  await db.insert(googleOAuthFlows).values({
    state: flow.state,
    mode: flow.mode,
    redirectTo: flow.redirectTo,
    sharedSignupToken: flow.sharedSignupToken,
    organizationName: flow.organizationName,
    codeVerifier: flow.codeVerifier,
    nonce: flow.nonce,
    expiresAt: flow.expiresAt,
  });

  return { state: flow.state, authorizationUrl };
}

function canonicalOriginRedirect(request: NextRequest) {
  const origin = getPublicAppOrigin();
  if (!origin) {
    return null;
  }

  const publicHost = new URL(origin).host.toLowerCase();
  const requestHost = request.headers.get("host")?.trim().toLowerCase();
  if (!requestHost || requestHost === publicHost) {
    return null;
  }

  const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `${origin}/`);
  return NextResponse.redirect(url);
}

/** GET /api/auth/google/start?mode=login — start Google login */
export async function GET(request: NextRequest) {
  if (!isGoogleAuthEnabled()) {
    return NextResponse.json(
      { error: "Google認証は有効化されていません" },
      { status: 503 },
    );
  }
  const canonicalRedirect = canonicalOriginRedirect(request);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: GoogleAuthMode = modeParam === "owner-signup" ||
    modeParam === "shared-signup" ||
    modeParam === "login"
    ? modeParam
    : "login";

  const redirectToParam = request.nextUrl.searchParams.get("redirectTo");
  const redirectTo = isAllowedRedirectTo(redirectToParam) ? redirectToParam : "/boards";
  const organizationName = normalizeOrganizationName(
    request.nextUrl.searchParams.get("organizationName"),
  );
  let sharedSignupToken: string | null = null;

  if (organizationName !== null && !isValidOrganizationName(organizationName)) {
    return NextResponse.json(
      { error: `組織名は${ORGANIZATION_NAME_MAX_LENGTH}文字以内で入力してください` },
      { status: 400 },
    );
  }

  if (mode === "shared-signup") {
    sharedSignupToken = request.nextUrl.searchParams.get("token");
    const now = new Date().toISOString();
    const signupRequest = sharedSignupToken
      ? await db.query.sharedSignupRequests.findFirst({
          where: and(
            eq(sharedSignupRequests.token, sharedSignupToken),
            isNull(sharedSignupRequests.completedAt),
            gt(sharedSignupRequests.expiresAt, now),
          ),
        })
      : null;
    if (!signupRequest) {
      return NextResponse.json(
        { error: "無効または期限切れの招待リンクです" },
        { status: 400 },
      );
    }
  }

  const rateLimit = await consumeRateLimit({
    rateLimitKey: buildRateLimitKey({
      flow: "google-oauth",
      clientIp: resolveRateLimitClientIp(request),
      subject: mode,
    }),
    windowMs: GOOGLE_OAUTH_RATE_LIMIT_WINDOW_MS,
    maxAttempts: GOOGLE_OAUTH_RATE_LIMIT_MAX,
  });
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "Google認証リクエストの上限に達しました", code: "google_oauth_rate_limited" },
      { status: 429 },
    );
  }

  const authorization = await createAuthorization({
    mode,
    redirectTo: mode === "login" ? redirectTo : null,
    sharedSignupToken,
    organizationName: mode === "owner-signup" ? organizationName : null,
  });
  if (!authorization) {
    return NextResponse.json(
      { error: "Google認証の設定が不完全です" },
      { status: 503 },
    );
  }

  const redirectResponse = NextResponse.redirect(authorization.authorizationUrl);
  redirectResponse.cookies.set(
    GOOGLE_OAUTH_STATE_COOKIE,
    authorization.state,
    buildAuthCookieOptions(GOOGLE_OAUTH_STATE_MAX_AGE),
  );
  return redirectResponse;
}
