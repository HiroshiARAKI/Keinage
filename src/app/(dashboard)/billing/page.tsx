// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForUser } from "@/lib/billing";
import { getRequestI18n } from "@/lib/i18n-server";
import { getOwnerUsage } from "@/lib/owner-usage";
import { getBillingConfig } from "@/lib/plans";
import { getPlanBoardSelectionState } from "@/lib/plan-board-selection";
import { BillingClient } from "@/components/dashboard/BillingClient";

type BillingNotice =
  | "checkout-success"
  | "checkout-cancelled"
  | "portal-return"
  | null;

function toBillingNotice(value: string | string[] | undefined): BillingNotice {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (
    normalized === "checkout-success"
    || normalized === "checkout-cancelled"
    || normalized === "portal-return"
  ) {
    return normalized;
  }

  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] | undefined }>;
}) {
  const { billingMode } = getBillingConfig();
  if (billingMode === "disabled") redirect("/settings");

  const session = await getSessionUser();
  if (!session) redirect("/pin");

  if (session.user.role !== "admin") {
    const { t } = await getRequestI18n();
    return (
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <h1 className="text-xl font-semibold">{t("billing.adminRequiredTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("billing.adminRequiredDescription")}
        </p>
      </div>
    );
  }

  const [effectivePlan, resolvedSearchParams] = await Promise.all([
    getEffectivePlanForUser(session.user),
    searchParams,
  ]);
  const [usage, boardSelection] = await Promise.all([
    getOwnerUsage(effectivePlan.ownerUserId),
    getPlanBoardSelectionState(effectivePlan.ownerUserId),
  ]);

  return (
    <BillingClient
      effectivePlan={effectivePlan}
      usage={usage}
      boardSelection={boardSelection}
      billingNotice={toBillingNotice(resolvedSearchParams.billing)}
    />
  );
}
