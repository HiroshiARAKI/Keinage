// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import {
  AUTH_SESSION_COOKIE,
  DEFAULT_AUTH_EXPIRE_DAYS,
  AUTH_EXPIRE_DAYS_KEY,
  isFullAuthValid,
} from "@/lib/auth";
import {
  DEVICE_AUTH_COOKIE,
  getDeviceAuthGrantByToken,
} from "@/lib/device-auth";
import { getOwnerSetting } from "@/lib/owner-settings";
import { resolveOwnerUserId } from "@/lib/ownership";
import { sanitizeRedirectTarget } from "@/lib/utils";
import { isGoogleAuthEnabled } from "@/lib/google-auth";
import { getWebAuthnRedirectForSession } from "@/lib/webauthn";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
}) {
  console.log("[/pin/login] START");
  const params = await searchParams;
  const redirectTo = sanitizeRedirectTarget(
    typeof params.redirectTo === "string" ? params.redirectTo : null,
  );
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;

  // If admin user not configured, redirect to setup
  const adminUser = await db.query.users.findFirst();
  if (!adminUser) {
    console.log("[/pin/login] No users → /signup");
    redirect("/signup");
  }

  // If already authenticated, redirect to dashboard
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const deviceToken = cookieStore.get(DEVICE_AUTH_COOKIE)?.value;
  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);
  let showPinLoginLink = false;

  if (deviceAuthGrant?.user.pinHash && deviceAuthGrant.user.status === "active") {
    const expireSetting = await getOwnerSetting(
      resolveOwnerUserId(deviceAuthGrant.user),
      AUTH_EXPIRE_DAYS_KEY,
    );
    const expireDays = expireSetting
      ? parseInt(expireSetting, 10)
      : DEFAULT_AUTH_EXPIRE_DAYS;

    showPinLoginLink = isFullAuthValid(
      deviceAuthGrant.lastFullAuthAt,
      expireDays,
    );

    console.log("[/pin/login] PIN link eligibility", {
      userId: deviceAuthGrant.user.userId,
      expireDays,
      showPinLoginLink,
    });
  }

  if (sessionCookie) {
    const sessionRow = await db.query.authSessions.findFirst({
      where: and(
        eq(authSessions.sessionToken, sessionCookie),
        gt(authSessions.expiresAt, new Date().toISOString()),
      ),
      with: { user: true },
    });
    if (sessionRow?.user.status === "active") {
      const sameUser = deviceAuthGrant?.user.id === sessionRow.user.id;
      const expireSetting = sameUser
        ? await getOwnerSetting(
            resolveOwnerUserId(sessionRow.user),
            AUTH_EXPIRE_DAYS_KEY,
          )
        : null;
      const expireDays = expireSetting
        ? parseInt(expireSetting, 10)
        : DEFAULT_AUTH_EXPIRE_DAYS;
      const deviceAuthLastFullAuthAt = sameUser
        ? deviceAuthGrant.lastFullAuthAt
        : null;
      const fullAuthValid = isFullAuthValid(
        deviceAuthLastFullAuthAt,
        expireDays,
      );

      console.log("[/pin/login] Existing session full-auth check", {
        sessionUserId: sessionRow.user.userId,
        deviceAuthUserId: deviceAuthGrant?.user.userId ?? null,
        deviceAuthLastFullAuthAt,
        expireDays,
        fullAuthValid,
      });

      if (fullAuthValid) {
        const passkeyRedirect = await getWebAuthnRedirectForSession({
          user: sessionRow.user,
          webauthnVerified: sessionRow.webauthnVerified,
          redirectTo,
        });
        if (passkeyRedirect) {
          redirect(passkeyRedirect);
        }
        console.log("[/pin/login] Already authenticated → target");
        redirect(redirectTo || "/boards");
      }

      console.log("[/pin/login] Session exists but device full-auth is not valid");
    }
    console.log("[/pin/login] Session cookie present but invalid/expired");
  }

  console.log("[/pin/login] Rendering LoginClient");
  return (
    <LoginClient
      redirectTo={redirectTo}
      notice={
        notice === "signup-existing" || notice === "password-reset"
          ? notice
          : null
      }
      showPinLoginLink={showPinLoginLink}
      googleAuthEnabled={isGoogleAuthEnabled()}
      initialError={
        error === "shared-user-inactive-due-to-plan"
          ? "shared-user-inactive-due-to-plan"
          : null
      }
    />
  );
}
