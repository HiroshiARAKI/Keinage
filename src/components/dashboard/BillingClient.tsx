// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckSquare,
  CreditCard,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageDashboard } from "@/components/dashboard/UsageDashboard";
import type { EffectivePlan } from "@/lib/billing";
import type { MessageKey } from "@/lib/i18n";
import type { OwnerUsage } from "@/lib/owner-usage";
import { buildPlanImpacts, type PlanImpact } from "@/lib/plan-impact";
import type { PlanBoardSelectionState } from "@/lib/plan-board-selection";
import {
  getPlanDefinition,
  type BillingInterval,
  type PaidPlanCode,
  type PlanCode,
} from "@/lib/plans";

type BillingNotice =
  | "checkout-success"
  | "checkout-cancelled"
  | "portal-return"
  | null;

interface PlanDisplay {
  code: Exclude<PlanCode, "self_hosted" | "unlimited">;
  name: string;
  audienceKey: MessageKey;
  monthlyPrice: string;
  yearlyPrice: string;
  boards: string;
  storageKey: MessageKey;
  resolution: string;
  videoKey: MessageKey;
  maxUpload: string;
  watermarkKey: MessageKey;
  deviceStatusKey: MessageKey;
}

const PLAN_DISPLAYS: PlanDisplay[] = [
  {
    code: "free",
    name: "Free",
    audienceKey: "billing.plan.free.audience",
    monthlyPrice: "¥0",
    yearlyPrice: "¥0",
    boards: "1",
    storageKey: "billing.plan.free.storage",
    resolution: "1920px",
    videoKey: "billing.value.unsupported",
    maxUpload: "5MB",
    watermarkKey: "billing.value.included",
    deviceStatusKey: "billing.value.unsupported",
  },
  {
    code: "lite",
    name: "Lite",
    audienceKey: "billing.plan.lite.audience",
    monthlyPrice: "¥600",
    yearlyPrice: "¥6,600",
    boards: "10",
    storageKey: "billing.plan.lite.storage",
    resolution: "1920px",
    videoKey: "billing.value.fhd",
    maxUpload: "100MB",
    watermarkKey: "billing.value.none",
    deviceStatusKey: "billing.value.included",
  },
  {
    code: "standard",
    name: "Standard",
    audienceKey: "billing.plan.standard.audience",
    monthlyPrice: "¥1,300",
    yearlyPrice: "¥14,300",
    boards: "100",
    storageKey: "billing.plan.standard.storage",
    resolution: "3840px",
    videoKey: "billing.value.fourK",
    maxUpload: "500MB",
    watermarkKey: "billing.value.none",
    deviceStatusKey: "billing.value.included",
  },
  {
    code: "standard_plus",
    name: "Standard+",
    audienceKey: "billing.plan.standardPlus.audience",
    monthlyPrice: "¥3,600",
    yearlyPrice: "¥39,600",
    boards: "300",
    storageKey: "billing.plan.standardPlus.storage",
    resolution: "3840px",
    videoKey: "billing.value.fourK",
    maxUpload: "2GB",
    watermarkKey: "billing.value.none",
    deviceStatusKey: "billing.value.included",
  },
];

const NEXT_PLAN: Partial<Record<PlanCode, PaidPlanCode>> = {
  free: "lite",
  lite: "standard",
  standard: "standard_plus",
};

const PLAN_RANK: Record<PlanCode, number> = {
  free: 0,
  lite: 1,
  standard: 2,
  standard_plus: 3,
  self_hosted: 10,
  unlimited: 10,
};

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  none: "billing.status.none",
  incomplete: "billing.status.incomplete",
  trialing: "billing.status.trialing",
  active: "billing.status.active",
  past_due: "billing.status.pastDue",
  canceled: "billing.status.canceled",
  unpaid: "billing.status.unpaid",
  paused: "billing.status.paused",
};

function getPlanName(planCode: PlanCode) {
  return PLAN_DISPLAYS.find((plan) => plan.code === planCode)?.name ?? planCode;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = Math.max(0, value);
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const maximumFractionDigits = unitIndex === 0 || amount >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(amount)} ${units[unitIndex]}`;
}

function formatImpactUsed(impact: PlanImpact) {
  if (
    impact.code === "storage"
    || impact.code === "max_upload"
  ) {
    return formatBytes(impact.used);
  }
  return formatNumber(impact.used);
}

function formatImpactLimit(impact: PlanImpact) {
  const value = impact.limit;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (
    impact.code === "storage"
    || impact.code === "max_upload"
  ) {
    return formatBytes(value);
  }
  if (impact.code === "video_resolution") {
    return `${formatNumber(value)}px`;
  }
  return formatNumber(value);
}

function PlanImpactList({
  impacts,
  t,
}: {
  impacts: PlanImpact[];
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  if (impacts.length === 0) return null;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {impacts.map((impact) => (
        <div key={impact.code} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={impact.severity === "over" ? "destructive" : "secondary"}>
              {impact.severity === "over"
                ? t("usage.overLimitBadge")
                : t("usage.reachedLimitBadge")}
            </Badge>
            <span className="font-medium">
              {t(impact.labelKey, {
                used: formatImpactUsed(impact),
                limit: formatImpactLimit(impact),
              })}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(impact.guidanceKey)}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatMonthlyPrice(plan: PlanDisplay, t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  if (plan.code === "free") return plan.monthlyPrice;
  return t("billing.price.monthly", { price: plan.monthlyPrice });
}

function formatYearlyPrice(plan: PlanDisplay, t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  if (plan.code === "free") return plan.yearlyPrice;
  return t("billing.price.yearly", { price: plan.yearlyPrice });
}

export function BillingClient({
  effectivePlan,
  usage,
  boardSelection,
  billingNotice,
}: {
  effectivePlan: EffectivePlan;
  usage: OwnerUsage;
  boardSelection: PlanBoardSelectionState;
  billingNotice: BillingNotice;
}) {
  const { t, formatDate } = useLocale();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [boardSelectionState, setBoardSelectionState] = useState(boardSelection);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(
    boardSelection.selectedBoardIds,
  );
  const [error, setError] = useState<string | null>(null);
  const [boardSelectionMessage, setBoardSelectionMessage] = useState<string | null>(null);
  const currentPlanCode = effectivePlan.plan.code;
  const subscription = effectivePlan.subscription;
  const isBillingActive =
    effectivePlan.billingMode === "stripe"
    && effectivePlan.planEnforcementMode === "billing";
  const isUnlimitedMode =
    effectivePlan.planEnforcementMode === "unlimited"
    || currentPlanCode === "unlimited";
  const isPaidPlan =
    currentPlanCode === "lite"
    || currentPlanCode === "standard"
    || currentPlanCode === "standard_plus";
  const recommendedPlan = NEXT_PLAN[currentPlanCode];

  const currentPlanDisplay = useMemo(() => {
    if (currentPlanCode === "unlimited" || currentPlanCode === "self_hosted") {
      return {
        name: t("billing.value.unlimited"),
        audience: t("billing.selfHostedAudience"),
      };
    }

    const plan = PLAN_DISPLAYS.find((item) => item.code === currentPlanCode) ?? PLAN_DISPLAYS[0];
    return {
      name: plan.name,
      audience: t(plan.audienceKey),
    };
  }, [currentPlanCode, t]);

  const notice = billingNotice ? t(`billing.notice.${billingNotice}` as MessageKey) : null;
  const statusKey = STATUS_LABEL_KEYS[subscription?.status ?? "none"] ?? "billing.status.none";
  const shouldShowBoardSelection =
    boardSelectionState.selectionMode === "pending"
    || boardSelectionState.inactiveDueToPlanBoards > 0
    || (
      boardSelectionState.limit !== null
      && boardSelectionState.totalBoards > boardSelectionState.limit
    );
  const selectionLimit = boardSelectionState.limit;
  const isSelectionOverLimit =
    selectionLimit !== null && selectedBoardIds.length > selectionLimit;
  const pendingPlanDefinition = boardSelectionState.pendingPlanCode
    ? getPlanDefinition(boardSelectionState.pendingPlanCode)
    : null;
  const pendingEffectiveDate = subscription?.pendingPlanEffectiveAt
    ?? (subscription?.cancelAtPeriodEnd ? subscription.cancelAt ?? subscription.currentPeriodEnd : null);
  const formattedPendingEffectiveDate = pendingEffectiveDate
    ? formatDate(pendingEffectiveDate, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Tokyo",
      })
    : null;
  const formattedCurrentPeriodEnd = subscription?.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Tokyo",
      })
    : null;
  const pendingPlanName = subscription?.pendingPlanCode
    ? getPlanName(subscription.pendingPlanCode)
    : null;
  const isCancelScheduled =
    subscription?.pendingPlanCode === "free"
    && !!formattedPendingEffectiveDate
    && (subscription.cancelAtPeriodEnd || !!subscription.cancelAt);
  const subscriptionAvailabilityNotice =
    subscription?.status === "canceled"
      ? t("billing.availability.canceled")
      : isCancelScheduled
        ? t("billing.availability.cancelScheduled", {
            plan: currentPlanDisplay.name,
            date: formattedPendingEffectiveDate ?? "",
          })
        : pendingPlanName && formattedPendingEffectiveDate
          ? t("billing.availability.changeScheduled", {
              currentPlan: currentPlanDisplay.name,
              nextPlan: pendingPlanName,
              date: formattedPendingEffectiveDate,
            })
          : null;
  const pendingPlanImpacts = pendingPlanDefinition
    ? buildPlanImpacts({
        usage,
        plan: pendingPlanDefinition,
        boardUsage: "total",
      })
    : [];
  const currentPlanImpacts = buildPlanImpacts({
    usage,
    plan: effectivePlan.plan,
    boardUsage: "active",
  });
  const shouldShowCurrentGuidance =
    currentPlanImpacts.length > 0
    || usage.inactiveDueToPlanBoards > 0;

  async function redirectFromApi(
    url: string,
    body?: Record<string, string>,
  ) {
    setError(null);
    const response = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.url !== "string") {
      const code = typeof data.code === "string" ? data.code : "unknown";
      const key = `billing.error.${code}` as MessageKey;
      const translated = t(key);
      throw new Error(translated === key ? t("billing.error.redirectFallback") : translated);
    }
    window.location.href = data.url;
  }

  async function startCheckout(planCode: PaidPlanCode, interval: BillingInterval) {
    const actionKey = `checkout:${planCode}:${interval}`;
    setLoadingAction(actionKey);
    try {
      await redirectFromApi("/api/billing/checkout", { planCode, interval });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("billing.error.checkoutFailed"));
      setLoadingAction(null);
    }
  }

  async function openPortal() {
    setLoadingAction("portal");
    try {
      await redirectFromApi("/api/billing/portal");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("billing.error.portalFailed"));
      setLoadingAction(null);
    }
  }

  function toggleBoardSelection(boardId: string) {
    setBoardSelectionMessage(null);
    setSelectedBoardIds((current) => {
      if (current.includes(boardId)) {
        return current.filter((id) => id !== boardId);
      }
      if (selectionLimit !== null && current.length >= selectionLimit) {
        setBoardSelectionMessage(t("billing.boardSelectionLimitError", { limit: selectionLimit }));
        return current;
      }
      return [...current, boardId];
    });
  }

  function selectAutoBoards() {
    setBoardSelectionMessage(null);
    setSelectedBoardIds(
      selectionLimit === null
        ? boardSelectionState.autoSelectedBoardIds
        : boardSelectionState.autoSelectedBoardIds.slice(0, selectionLimit),
    );
  }

  async function saveBoardSelection() {
    if (isSelectionOverLimit) {
      setBoardSelectionMessage(t("billing.boardSelectionLimitError", { limit: selectionLimit ?? 0 }));
      return;
    }

    setLoadingAction("board-selection");
    setBoardSelectionMessage(null);
    try {
      const response = await fetch("/api/billing/board-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedBoardIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(t("billing.boardSelectionSaveFailed"));
      }
      if (data.state) {
        setBoardSelectionState(data.state);
        setSelectedBoardIds(data.state.selectedBoardIds ?? selectedBoardIds);
      }
      setBoardSelectionMessage(t("billing.boardSelectionSaved"));
    } catch (caught) {
      setBoardSelectionMessage(
        caught instanceof Error ? caught.message : t("billing.boardSelectionSaveFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("billing.description")}
          </p>
        </div>
        {isBillingActive && isPaidPlan && (
          <Button onClick={openPortal} disabled={loadingAction === "portal"}>
            <CreditCard className="size-4" />
            {t("billing.manageButton")}
            <ExternalLink className="size-3.5" />
          </Button>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          {notice}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t("billing.currentPlan")}</h2>
              <Badge variant={isUnlimitedMode ? "secondary" : "default"}>
                {currentPlanDisplay.name}
              </Badge>
              <Badge variant="outline">{t(statusKey)}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {currentPlanDisplay.audience}
            </p>
          </div>

          <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:min-w-96">
            <div>
              <dt className="text-muted-foreground">{t("billing.billingInterval")}</dt>
              <dd className="font-medium">
                {subscription?.billingInterval === "monthly"
                  ? t("billing.interval.monthly")
                  : subscription?.billingInterval === "yearly"
                    ? t("billing.interval.yearly")
                    : t("billing.value.unset")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("billing.nextRenewal")}</dt>
              <dd className="font-medium">
                {subscription?.currentPeriodEnd
                  ? formattedCurrentPeriodEnd
                  : t("billing.value.unset")}
              </dd>
            </div>
          </dl>
        </div>

        {subscriptionAvailabilityNotice && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            {subscriptionAvailabilityNotice}
          </div>
        )}

        {subscription?.status === "past_due" && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            {t("billing.pastDue")}
          </div>
        )}

        {isUnlimitedMode && (
          <div className="mt-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {t("billing.unlimitedModeNotice")}
          </div>
        )}
      </section>

      <UsageDashboard
        effectivePlan={effectivePlan}
        usage={usage}
        showUpgradeAction
      />

      {pendingPlanDefinition && pendingPlanImpacts.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4" />
                <h2 className="font-semibold">
                  {t("billing.downgradeImpactTitle", { plan: pendingPlanDefinition.name })}
                </h2>
              </div>
              <p className="mt-2 text-sm">
                {t("billing.downgradeImpactDescription", { plan: pendingPlanDefinition.name })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { window.location.href = "/boards"; }}
              >
                {t("billing.resolveBoardsAction")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { window.location.href = "/settings#media-management"; }}
              >
                {t("billing.resolveMediaAction")}
              </Button>
            </div>
          </div>
          <PlanImpactList impacts={pendingPlanImpacts} t={t} />
        </section>
      )}

      {shouldShowCurrentGuidance && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4" />
                <h2 className="font-semibold">{t("billing.overLimitGuidanceTitle")}</h2>
              </div>
              <p className="mt-2 text-sm">{t("billing.overLimitGuidanceDescription")}</p>
              {usage.inactiveDueToPlanBoards > 0 && (
                <p className="mt-2 text-sm">
                  {t("billing.inactiveBoardsGuidance", {
                    count: usage.inactiveDueToPlanBoards,
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { window.location.href = "/boards"; }}
              >
                {t("billing.resolveBoardsAction")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { window.location.href = "/settings#media-management"; }}
              >
                {t("billing.resolveMediaAction")}
              </Button>
              {isBillingActive && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { window.location.href = "/billing#plan-comparison"; }}
                >
                  {t("usage.upgradeButton")}
                </Button>
              )}
            </div>
          </div>
          <PlanImpactList impacts={currentPlanImpacts} t={t} />
        </section>
      )}

      {shouldShowBoardSelection && (
        <section id="board-activation" className="rounded-lg border bg-card p-5 text-card-foreground">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CheckSquare className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">{t("billing.boardSelectionTitle")}</h2>
                <Badge variant={boardSelectionState.selectionMode === "pending" ? "default" : "secondary"}>
                  {boardSelectionState.selectionPlanName}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {boardSelectionState.selectionMode === "pending"
                  ? t("billing.boardSelectionPendingDescription", {
                      plan: boardSelectionState.selectionPlanName,
                      limit: selectionLimit ?? t("billing.value.unlimited"),
                    })
                  : t("billing.boardSelectionDescription", {
                      plan: boardSelectionState.selectionPlanName,
                      limit: selectionLimit ?? t("billing.value.unlimited"),
                    })}
              </p>
              {boardSelectionState.pendingPlanEffectiveAt && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  {t("billing.boardSelectionPendingEffectiveAt", {
                    date: formatDate(boardSelectionState.pendingPlanEffectiveAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }),
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectAutoBoards}
                disabled={loadingAction === "board-selection"}
              >
                {t("billing.boardSelectionAuto")}
              </Button>
              <Button
                type="button"
                onClick={saveBoardSelection}
                disabled={loadingAction === "board-selection" || isSelectionOverLimit}
              >
                {loadingAction === "board-selection"
                  ? t("common.loading")
                  : t("billing.boardSelectionSave")}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Badge variant={isSelectionOverLimit ? "destructive" : "outline"}>
              {t("billing.boardSelectionCount", {
                selected: selectedBoardIds.length,
                limit: selectionLimit ?? t("billing.value.unlimited"),
              })}
            </Badge>
            {boardSelectionState.inactiveDueToPlanBoards > 0 && (
              <Badge variant="secondary">
                {t("billing.boardSelectionInactiveCount", {
                  count: boardSelectionState.inactiveDueToPlanBoards,
                })}
              </Badge>
            )}
          </div>

          {boardSelectionMessage && (
            <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {boardSelectionMessage}
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {boardSelectionState.boards.map((board) => {
              const checked = selectedBoardIds.includes(board.id);
              const disabled =
                !checked && selectionLimit !== null && selectedBoardIds.length >= selectionLimit;
              return (
                <label
                  key={board.id}
                  className="flex min-w-0 items-start gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={checked}
                    disabled={disabled || loadingAction === "board-selection"}
                    onChange={() => toggleBoardSelection(board.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{board.name}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{t("common.updatedAt")}: {formatDate(board.updatedAt)}</span>
                      {board.lastViewedAt && (
                        <span>{t("billing.boardSelectionLastViewed")}: {formatDate(board.lastViewedAt)}</span>
                      )}
                      {board.status === "inactive_due_to_plan" && (
                        <Badge variant="secondary">{t("billing.boardStatusInactiveDueToPlan")}</Badge>
                      )}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {recommendedPlan && isBillingActive && (
        <section className="rounded-lg border bg-card p-5 text-card-foreground">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="font-semibold">{t("billing.recommendedTitle")}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("billing.recommendedDescription", { plan: getPlanName(recommendedPlan) })}
              </p>
            </div>
            {isPaidPlan ? (
              <Button variant="outline" onClick={openPortal} disabled={loadingAction === "portal"}>
                {t("billing.portalChange")}
                <ExternalLink className="size-3.5" />
              </Button>
            ) : (
              <Button
                onClick={() => startCheckout(recommendedPlan, "monthly")}
                disabled={loadingAction !== null}
              >
                {t("billing.startMonthly")}
                <ExternalLink className="size-3.5" />
              </Button>
            )}
          </div>
        </section>
      )}

      <section id="plan-comparison">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t("billing.comparisonTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("billing.comparisonDescription")}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {PLAN_DISPLAYS.map((plan) => {
            const isCurrentPlan = plan.code === currentPlanCode;
            const paidCode = plan.code === "free" ? null : plan.code;
            const isRecommended = plan.code === recommendedPlan;
            const isDowngradeTarget =
              PLAN_RANK[plan.code] < PLAN_RANK[currentPlanCode];
            const planImpacts = isDowngradeTarget
              ? buildPlanImpacts({
                  usage,
                  plan: getPlanDefinition(plan.code),
                  boardUsage: "total",
                })
              : [];
            return (
              <article
                key={plan.code}
                className="rounded-lg border bg-card p-5 text-card-foreground"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {isCurrentPlan && <Badge>{t("billing.current")}</Badge>}
                      {isRecommended && <Badge variant="secondary">{t("billing.recommended")}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t(plan.audienceKey)}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatMonthlyPrice(plan, t)}</div>
                    <div className="text-xs text-muted-foreground">{formatYearlyPrice(plan, t)}</div>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.boards")}</dt>
                    <dd className="font-medium">{t("billing.value.boards", { count: plan.boards })}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.storage")}</dt>
                    <dd className="font-medium">{t(plan.storageKey)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.resolution")}</dt>
                    <dd className="font-medium">{plan.resolution}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.video")}</dt>
                    <dd className="font-medium">{t(plan.videoKey)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.maxUpload")}</dt>
                    <dd className="font-medium">{plan.maxUpload}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.watermark")}</dt>
                    <dd className="font-medium">{t(plan.watermarkKey)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("billing.feature.deviceStatus")}</dt>
                    <dd className="font-medium">{t(plan.deviceStatusKey)}</dd>
                  </div>
                </dl>

                {planImpacts.length > 0 && (
                  <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle className="size-4" />
                      {t("billing.planImpactCardTitle")}
                    </div>
                    <PlanImpactList impacts={planImpacts} t={t} />
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {isCurrentPlan && (
                    <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm text-muted-foreground">
                      <Check className="size-3.5" />
                      {t("billing.inUse")}
                    </div>
                  )}

                  {!isCurrentPlan && paidCode && isBillingActive && !isPaidPlan && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => startCheckout(paidCode, "monthly")}
                        disabled={loadingAction !== null}
                      >
                        {t("billing.chooseMonthly")}
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startCheckout(paidCode, "yearly")}
                        disabled={loadingAction !== null}
                      >
                        {t("billing.chooseYearly")}
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </>
                  )}

                  {!isCurrentPlan && paidCode && isBillingActive && isPaidPlan && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openPortal}
                      disabled={loadingAction !== null}
                    >
                      {t("billing.portalChange")}
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}

                  {!isBillingActive && paidCode && (
                    <span className="text-sm text-muted-foreground">
                      {t("billing.availableWhenEnabled")}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
