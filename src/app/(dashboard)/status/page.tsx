// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForUser } from "@/lib/billing";
import { getRequestI18n } from "@/lib/i18n-server";
import { getOwnerUsage } from "@/lib/owner-usage";
import { UsageDashboard } from "@/components/dashboard/UsageDashboard";
import { BoardDeviceStatusPanel } from "@/components/dashboard/BoardDeviceStatusPanel";
import { VersionInfoPanel } from "@/components/dashboard/VersionInfoPanel";

export default async function StatusPage() {
  const session = await getSessionUser();
  if (!session) redirect("/pin");

  const { t } = await getRequestI18n();
  if (session.user.role !== "admin") {
    return (
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <h1 className="text-xl font-semibold">{t("billing.adminRequiredTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("billing.adminRequiredDescription")}
        </p>
      </div>
    );
  }

  const effectivePlan = await getEffectivePlanForUser(session.user);
  const usage = await getOwnerUsage(effectivePlan.ownerUserId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("status.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("status.description")}
        </p>
      </div>

      <UsageDashboard
        effectivePlan={effectivePlan}
        usage={usage}
        showUpgradeAction
      />
      <BoardDeviceStatusPanel />
      <VersionInfoPanel />
    </div>
  );
}
