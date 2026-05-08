// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getSessionUser } from "@/lib/auth";
import { getRequestI18n } from "@/lib/i18n-server";
import { AnnouncementsClient } from "@/components/dashboard/AnnouncementsClient";

export default async function AnnouncementsPage() {
  const { t } = await getRequestI18n();
  const session = await getSessionUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("announcements.pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("announcements.pageDescription")}
        </p>
      </div>
      <AnnouncementsClient isSuperOwner={session?.user.isSuperOwner === true} />
    </div>
  );
}
