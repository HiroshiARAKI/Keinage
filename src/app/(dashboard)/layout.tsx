// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
import { isOwnerUser, resolveOwnerUserId } from "@/lib/ownership";
import { getBillingConfig } from "@/lib/plans";
import { ThemeProvider } from "@/components/dashboard/ThemeProvider";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read cookies first to signal Next.js that this layout is dynamic.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const deviceToken = cookieStore.get(DEVICE_AUTH_COOKIE)?.value;

  console.log("[dashboard/layout] Auth check", { hasSessionToken: !!sessionToken });

  if (!sessionToken) {
    console.log("[dashboard/layout] No session token → /pin");
    redirect("/pin");
  }

  // Validate session
  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.sessionToken, sessionToken),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ),
    with: { user: true },
  });

  if (!session) {
    console.log("[dashboard/layout] Session not found or expired → /pin");
    redirect("/pin");
  }

  // Check full-auth validity
  const ownerUserId = resolveOwnerUserId(session.user);
  const expireSetting = await getOwnerSetting(ownerUserId, AUTH_EXPIRE_DAYS_KEY);
  const expireDays = expireSetting
    ? parseInt(expireSetting, 10)
    : DEFAULT_AUTH_EXPIRE_DAYS;

  const deviceAuthGrant = await getDeviceAuthGrantByToken(deviceToken);
  const sameUser = deviceAuthGrant?.user.id === session.user.id;
  const deviceAuthLastFullAuthAt = sameUser
    ? deviceAuthGrant.lastFullAuthAt
    : null;
  const fullValid = isFullAuthValid(deviceAuthLastFullAuthAt, expireDays);
  console.log("[dashboard/layout] Full auth check", {
    userId: session.user.userId,
    deviceAuthUserId: deviceAuthGrant?.user.userId ?? null,
    lastFullAuthAt: deviceAuthLastFullAuthAt,
    expireDays,
    fullValid,
  });

  if (!fullValid) {
    console.log("[dashboard/layout] Full auth expired for this device → /pin/login");
    redirect("/pin/login");
  }

  const { userId, role, colorTheme } = session.user;
  const { billingMode } = getBillingConfig();
  const showOwnerOnboarding =
    isOwnerUser(session.user)
    && session.user.ownerOnboardingAcknowledgedAt === null;

  return (
    <ThemeProvider initialTheme={colorTheme as "system" | "light" | "dark"}>
      <DashboardShell
        userId={userId}
        role={role}
        isSuperOwner={session.user.isSuperOwner}
        billingEnabled={billingMode === "stripe"}
        initialTheme={colorTheme as "system" | "light" | "dark"}
        showOwnerOnboarding={showOwnerOnboarding}
      >
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
