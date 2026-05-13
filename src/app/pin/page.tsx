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
import { getWebAuthnRedirectForSession } from "@/lib/webauthn";
import PinLoginClient from "./PinLoginClient";

export const dynamic = "force-dynamic";

export default async function PinLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const params = await searchParams;
  const redirectTo = sanitizeRedirectTarget(
    typeof params.redirectTo === "string" ? params.redirectTo : null,
  );
  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const deviceToken = cookieStore.get(DEVICE_AUTH_COOKIE)?.value;
  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);

  console.log("[/pin] START", {
    hasSessionCookie: !!sessionCookie,
    hasDeviceAuthGrant: !!deviceAuthGrant,
    deviceAuthUserId: deviceAuthGrant?.user.userId ?? null,
  });

  // ── 1. Already authenticated? → dashboard ─────────────────────────
  if (sessionCookie) {
    const sessionRow = await db.query.authSessions.findFirst({
      where: and(
        eq(authSessions.sessionToken, sessionCookie),
        gt(authSessions.expiresAt, new Date().toISOString()),
      ),
      with: { user: true },
    });
    if (sessionRow) {
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
      const fullSessionValid = isFullAuthValid(
        deviceAuthLastFullAuthAt,
        expireDays,
      );

      console.log("[/pin] Existing session full-auth check", {
        sessionUserId: sessionRow.user.userId,
        deviceAuthUserId: deviceAuthGrant?.user.userId ?? null,
        deviceAuthLastFullAuthAt,
        expireDays,
        fullSessionValid,
      });

      if (fullSessionValid) {
        const passkeyRedirect = await getWebAuthnRedirectForSession({
          user: sessionRow.user,
          webauthnVerified: sessionRow.webauthnVerified,
          redirectTo,
        });
        if (passkeyRedirect) {
          redirect(passkeyRedirect);
        }
        console.log("[/pin] Valid session found → target");
        redirect(redirectTo || "/boards");
      }

      console.log("[/pin] Session cookie present but device full-auth is not valid");
    }
    console.log("[/pin] Session cookie present but invalid/expired");
  }

  // ── 2. Resolve target user ─────────────────────────────────────────
  const targetUser = deviceAuthGrant?.user ?? null;

  console.log("[/pin] Device auth lookup", {
    found: !!targetUser,
    hasPIN: !!targetUser?.pinHash,
    userId: targetUser?.userId ?? null,
  });

  if (targetUser) {
    // Cookie user found. If they have no PIN they must use credentials login.
    if (!targetUser.pinHash) {
      console.log("[/pin] Cookie user has no PIN → /pin/login");
      redirect(
        redirectTo
          ? `/pin/login?redirectTo=${encodeURIComponent(redirectTo)}`
          : "/pin/login",
      );
    }
  } else {
    // Without a remembered user, require credential login so we don't pick an arbitrary owner.
    const anyUser = await db.query.users.findFirst();
    if (!anyUser) {
      console.log("[/pin] No users at all → /signup");
      redirect("/signup");
    }
    console.log("[/pin] No remembered user → /pin/login");
    redirect(
      redirectTo
        ? `/pin/login?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/pin/login",
    );
  }

  if (!deviceAuthGrant) {
    redirect(
      redirectTo
        ? `/pin/login?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/pin/login",
    );
  }

  // ── 3. Check full auth validity ────────────────────────────────────
  const ownerUserId = resolveOwnerUserId(targetUser);
  const expireSetting = await getOwnerSetting(ownerUserId, AUTH_EXPIRE_DAYS_KEY);
  const expireDays = expireSetting
    ? parseInt(expireSetting, 10)
    : DEFAULT_AUTH_EXPIRE_DAYS;

  const fullAuthValid = isFullAuthValid(deviceAuthGrant.lastFullAuthAt, expireDays);
  console.log("[/pin] Full auth check", {
    userId: targetUser.userId,
    lastFullAuthAt: deviceAuthGrant.lastFullAuthAt,
    expireDays,
    fullAuthValid,
  });

  if (!fullAuthValid) {
    console.log("[/pin] Full auth expired → /pin/login");
    redirect(
      redirectTo
        ? `/pin/login?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/pin/login",
    );
  }

  console.log("[/pin] Showing PIN screen for", targetUser.userId);
  return <PinLoginClient userId={targetUser.userId} redirectTo={redirectTo} />;
}
