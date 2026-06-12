// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { SuperOwnerUserDirectory } from "@/components/dashboard/SuperOwnerUserDirectory";
import { getSessionUser } from "@/lib/auth";
import { getRequestI18n } from "@/lib/i18n-server";

export default async function SuperOwnerUsersPage() {
  const [session, { t }] = await Promise.all([
    getSessionUser(),
    getRequestI18n(),
  ]);

  if (!session?.user.isSuperOwner) {
    redirect("/boards");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("superOwnerUsers.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("superOwnerUsers.description")}
        </p>
      </div>
      <SuperOwnerUserDirectory />
    </div>
  );
}
