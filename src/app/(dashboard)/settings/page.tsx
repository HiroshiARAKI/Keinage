// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { AUTH_SESSION_COOKIE } from "@/lib/auth";
import { SettingsClient } from "@/components/dashboard/SettingsClient";
import { getRequestI18n } from "@/lib/i18n-server";
import { isOwnerUser } from "@/lib/ownership";

export default async function SettingsPage() {
  const { t } = await getRequestI18n();
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) redirect("/pin");

  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.sessionToken, token),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ),
    with: { user: true },
  });
  if (!session) redirect("/pin");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <SettingsClient
        role={session.user.role as "admin" | "general"}
        currentUserId={session.user.userId}
        isOwner={isOwnerUser(session.user)}
      />
    </div>
  );
}
