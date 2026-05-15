// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, googleOAuthFlows, sharedSignupRequests, users } from "@/db/schema";
import {
  buildRelativeAppPath,
  buildExpiredAuthCookieOptions,
  createCookieCommittedNavigationPage,
} from "@/lib/auth";
import {
  GOOGLE_AUTH_PROVIDER,
  GOOGLE_OAUTH_STATE_COOKIE,
  fetchGoogleUserInfo,
  createSignedInResponse,
  isGoogleOAuthStateBoundToBrowser,
} from "@/lib/google-auth";
import { DEVICE_AUTH_COOKIE } from "@/lib/device-auth";
import { buildSuccessfulAuthState } from "@/lib/account-security";
import { sendSignupCompletedEmail } from "@/lib/mail";
import { buildPublicAppUrl } from "@/lib/public-origin";
import { buildRequestAppUrl } from "@/lib/public-origin";
import { maybeBootstrapSuperOwner } from "@/lib/super-owner";
import {
  getWebAuthnPostAuthAction,
  isWebAuthnVerifiedAtSessionCreation,
} from "@/lib/webauthn";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";

const SETUP_SESSION_MAX_AGE = 60 * 15;
const GOOGLE_USER_ID_FALLBACK = "google-user";

function absoluteUrl(request: NextRequest, pathname: string) {
  return buildPublicAppUrl(pathname) ?? buildRequestAppUrl(request, pathname) ?? pathname;
}

function errorRedirect(_request: NextRequest, pathname: string, message: string) {
  const targetPath = buildRelativeAppPath({
    pathname,
    searchParams: { error: message },
  });
  const response = new NextResponse(
    createCookieCommittedNavigationPage({
      redirectTo: buildRequestAppUrl(_request, targetPath) ?? targetPath,
      title: "Redirecting...",
      message: "ログイン画面に戻っています...",
    }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", buildExpiredAuthCookieOptions(_request));
  return response;
}

function noticeRedirect(_request: NextRequest, pathname: string, notice: string) {
  const targetPath = buildRelativeAppPath({
    pathname,
    searchParams: { notice },
  });
  const response = new NextResponse(
    createCookieCommittedNavigationPage({
      redirectTo: buildRequestAppUrl(_request, targetPath) ?? targetPath,
      title: "Redirecting...",
      message: "ログイン画面に戻っています...",
    }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", buildExpiredAuthCookieOptions(_request));
  return response;
}

function createGoogleUserIdBase(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized.length >= 3 ? normalized : GOOGLE_USER_ID_FALLBACK;
  return base.slice(0, 32).replace(/-+$/g, "") || GOOGLE_USER_ID_FALLBACK;
}

async function buildUniqueGoogleUserId(email: string) {
  const base = createGoogleUserIdBase(email);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    const existing = await db.query.users.findFirst({
      where: eq(users.userId, candidate),
    });
    if (!existing) {
      return candidate;
    }
  }

  return `${base.slice(0, 23)}-${randomUUID().slice(0, 8)}`;
}

/** GET /api/auth/google/callback — complete Google OAuth */
export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    await writeAuditLog({
      action: "login_failed",
      targetType: "auth",
      result: "failure",
      reason: "google_cancelled",
      request,
      metadata: { method: "google" },
    });
    return errorRedirect(request, "/pin/login", "google-cancelled");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const browserBoundStateValid = state
    ? isGoogleOAuthStateBoundToBrowser({
        state,
        userAgent: request.headers.get("user-agent"),
      })
    : false;
  if (!code || !state || (stateCookie ? state !== stateCookie : !browserBoundStateValid)) {
    await writeAuditLog({
      action: "login_failed",
      targetType: "auth",
      result: "failure",
      reason: "invalid_google_state",
      request,
      metadata: { method: "google" },
    });
    return errorRedirect(request, "/pin/login", "invalid-google-state");
  }

  const now = new Date().toISOString();
  const flow = await db.query.googleOAuthFlows.findFirst({
    where: and(
      eq(googleOAuthFlows.state, state),
      isNull(googleOAuthFlows.consumedAt),
      gt(googleOAuthFlows.expiresAt, now),
    ),
  });
  if (!flow) {
    await writeAuditLog({
      action: "login_failed",
      targetType: "auth",
      result: "failure",
      reason: "invalid_google_state",
      request,
      metadata: { method: "google" },
    });
    return errorRedirect(request, "/pin/login", "invalid-google-state");
  }

  await db
    .update(googleOAuthFlows)
    .set({ consumedAt: now })
    .where(eq(googleOAuthFlows.state, state));

  const googleUser = await fetchGoogleUserInfo({
    code,
    codeVerifier: flow.codeVerifier,
    expectedNonce: flow.nonce,
  });
  if (!googleUser || googleUser.email_verified !== true) {
    await writeAuditLog({
      action: "login_failed",
      targetType: "auth",
      result: "failure",
      reason: "google_email_unverified",
      request,
      metadata: { method: "google", mode: flow.mode },
    });
    return errorRedirect(request, "/pin/login", "google-email-unverified");
  }

  const deviceToken = request.cookies.get(DEVICE_AUTH_COOKIE)?.value;

  if (flow.mode === "login") {
    const account = await db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.provider, GOOGLE_AUTH_PROVIDER),
        eq(authAccounts.providerAccountId, googleUser.sub),
      ),
      with: { user: true },
    });
    let user = account?.user ?? null;

    if (!user) {
      const existingGoogleOnlyUser = await db.query.users.findFirst({
        where: eq(users.email, googleUser.email),
      });

      if (!existingGoogleOnlyUser || existingGoogleOnlyUser.passwordHash) {
        await writeAuditLog({
          action: "login_failed",
          targetType: "user",
          result: "failure",
          reason: "google_user_not_found",
          request,
          metadata: { method: "google" },
        });
        return errorRedirect(request, "/pin/login", "google-user-not-found");
      }

      await db.insert(authAccounts).values({
        userId: existingGoogleOnlyUser.id,
        provider: GOOGLE_AUTH_PROVIDER,
        providerAccountId: googleUser.sub,
        email: googleUser.email,
      });
      user = existingGoogleOnlyUser;
    }

    await db
      .update(users)
      .set(buildSuccessfulAuthState(now))
      .where(eq(users.id, user.id));

    await maybeBootstrapSuperOwner({
      user,
      emailVerified: true,
      authenticatedProvider: "google",
      request,
    });

    const webauthnAction = await getWebAuthnPostAuthAction(user);
    const webauthnRedirectSuffix = flow.redirectTo
      ? `?redirectTo=${encodeURIComponent(flow.redirectTo)}`
      : "";
    const redirectPath = user.pinHash
      ? webauthnAction === "register"
        ? `/passkey/setup${webauthnRedirectSuffix}`
        : webauthnAction === "authenticate"
          ? `/passkey/verify${webauthnRedirectSuffix}`
          : (flow.redirectTo ?? "/boards")
      : "/pin/setup";
    const response = await createSignedInResponse({
      request,
      requestDeviceToken: deviceToken,
      userId: user.id,
      redirectTo: redirectPath,
      setupSessionMaxAge: user.pinHash ? undefined : SETUP_SESSION_MAX_AGE,
      locale: user.locale,
      acceptLanguage: request.headers.get("accept-language"),
      webauthnVerified: user.pinHash
        ? await isWebAuthnVerifiedAtSessionCreation(user)
        : true,
    });
    await writeUserAuditLog({
      user,
      action: "login_success",
      result: "success",
      request,
      metadata: { method: "google" },
    });
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", buildExpiredAuthCookieOptions(request));
    return response;
  }

  if (flow.mode === "owner-signup") {
    const existingAccount = await db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.provider, GOOGLE_AUTH_PROVIDER),
        eq(authAccounts.providerAccountId, googleUser.sub),
      ),
    });
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, googleUser.email),
    });
    if (existingAccount || existingUser) {
      return noticeRedirect(request, "/pin/login", "signup-existing");
    }

    const userId = await buildUniqueGoogleUserId(googleUser.email);
    const [createdUser] = await db
      .insert(users)
      .values({
        userId,
        email: googleUser.email,
        phoneNumber: null,
        organizationName: flow.organizationName,
        passwordHash: null,
        attribute: "owner",
        role: "admin",
        lastFullAuthAt: now,
      })
      .returning();

    await db.insert(authAccounts).values({
      userId: createdUser.id,
      provider: GOOGLE_AUTH_PROVIDER,
      providerAccountId: googleUser.sub,
      email: googleUser.email,
    });

    await maybeBootstrapSuperOwner({
      user: createdUser,
      emailVerified: true,
      authenticatedProvider: "google",
      request,
    });

    await sendSignupCompletedEmail({
      to: createdUser.email,
      loginUrl: absoluteUrl(request, "/pin/login"),
      acceptLanguage: request.headers.get("accept-language"),
    });

    const response = await createSignedInResponse({
      request,
      requestDeviceToken: deviceToken,
      userId: createdUser.id,
      redirectTo: "/pin/setup",
      setupSessionMaxAge: SETUP_SESSION_MAX_AGE,
      locale: createdUser.locale,
      acceptLanguage: request.headers.get("accept-language"),
      webauthnVerified: true,
    });
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", buildExpiredAuthCookieOptions(request));
    return response;
  }

  if (flow.mode === "shared-signup") {
    if (!flow.sharedSignupToken) {
      return errorRedirect(request, "/signup/shared", "invalid-signup-state");
    }

    const signupRequest = await db.query.sharedSignupRequests.findFirst({
      where: and(
        eq(sharedSignupRequests.token, flow.sharedSignupToken),
        isNull(sharedSignupRequests.completedAt),
        gt(sharedSignupRequests.expiresAt, now),
      ),
    });
    if (!signupRequest) {
      return errorRedirect(request, "/signup/shared", "invalid-invitation");
    }
    if (signupRequest.email !== googleUser.email) {
      return errorRedirect(request, "/signup/shared", "google-email-mismatch");
    }

    const existingAccount = await db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.provider, GOOGLE_AUTH_PROVIDER),
        eq(authAccounts.providerAccountId, googleUser.sub),
      ),
    });
    const existingUser = await db.query.users.findFirst({
      where: or(
        eq(users.userId, signupRequest.userId),
        eq(users.email, signupRequest.email),
      ),
    });
    if (existingAccount || existingUser) {
      return errorRedirect(request, "/signup/shared", "user-already-exists");
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        userId: signupRequest.userId,
        email: signupRequest.email,
        passwordHash: null,
        attribute: "shared",
        ownerUserId: signupRequest.ownerUserId,
        role: signupRequest.role,
        lastFullAuthAt: now,
      })
      .returning();

    await db.insert(authAccounts).values({
      userId: createdUser.id,
      provider: GOOGLE_AUTH_PROVIDER,
      providerAccountId: googleUser.sub,
      email: signupRequest.email,
    });

    await db
      .update(sharedSignupRequests)
      .set({ completedAt: now })
      .where(eq(sharedSignupRequests.id, signupRequest.id));

    await sendSignupCompletedEmail({
      to: createdUser.email,
      loginUrl: absoluteUrl(request, "/pin/login"),
      acceptLanguage: request.headers.get("accept-language"),
    });

    const response = await createSignedInResponse({
      request,
      requestDeviceToken: deviceToken,
      userId: createdUser.id,
      redirectTo: "/pin/setup",
      setupSessionMaxAge: SETUP_SESSION_MAX_AGE,
      locale: createdUser.locale,
      acceptLanguage: request.headers.get("accept-language"),
      webauthnVerified: true,
    });
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", buildExpiredAuthCookieOptions(request));
    return response;
  }

  return errorRedirect(request, "/pin/login", "invalid-google-mode");
}
