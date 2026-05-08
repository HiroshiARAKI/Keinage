// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import {
  AlertCircle,
  HardDrive,
  ImageIcon,
  LayoutDashboard,
  Upload,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { EffectivePlan } from "@/lib/billing";
import type { MessageKey } from "@/lib/i18n";
import type { OwnerUsage } from "@/lib/owner-usage";

type UsageLevel = "ok" | "near" | "reached" | "over";

interface UsageMetric {
  key: string;
  labelKey: MessageKey;
  used: number;
  limit: number | null;
  formatter?: (value: number) => string;
}

function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null || limit <= 0) return "ok";
  if (used > limit) return "over";
  if (used === limit) return "reached";
  if (used / limit >= 0.8) return "near";
  return "ok";
}

function progressValue(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatBytes(value: number, locale: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = Math.max(0, value);
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = unitIndex === 0 || amount >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(amount)} ${units[unitIndex]}`;
}

function formatLimitValue(
  metric: UsageMetric,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
) {
  const format = metric.formatter ?? ((value: number) => String(value));
  if (metric.limit === null) {
    return t("usage.usedUnlimited", { used: format(metric.used) });
  }
  return t("usage.usedOfLimit", {
    used: format(metric.used),
    limit: format(metric.limit),
  });
}

function metricClass(level: UsageLevel) {
  if (level === "over") return "border-destructive/40 bg-destructive/5";
  if (level === "reached") {
    return "border-amber-500 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40";
  }
  if (level === "near") {
    return "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30";
  }
  return "bg-card";
}

function alertTitleKey(level: UsageLevel): MessageKey {
  if (level === "over") return "usage.overLimitTitle";
  if (level === "reached") return "usage.reachedLimitTitle";
  return "usage.nearLimitTitle";
}

function alertDescriptionKey(level: UsageLevel): MessageKey {
  if (level === "over") return "usage.overLimitDescription";
  if (level === "reached") return "usage.reachedLimitDescription";
  return "usage.nearLimitDescription";
}

function badgeTextKey(level: UsageLevel): MessageKey {
  if (level === "over") return "usage.overLimitBadge";
  if (level === "reached") return "usage.reachedLimitBadge";
  return "usage.nearLimitBadge";
}

function progressClass(level: UsageLevel) {
  if (level === "over") return "bg-destructive";
  if (level === "reached") return "bg-amber-600";
  if (level === "near") return "bg-amber-500";
  return "bg-primary";
}

function storageChartColor(level: UsageLevel) {
  if (level === "over") return "var(--destructive)";
  if (level === "reached") return "oklch(0.666 0.179 58.318)";
  if (level === "near") return "oklch(0.769 0.188 70.08)";
  return "var(--primary)";
}

export function UsageDashboard({
  effectivePlan,
  usage,
  showUpgradeAction = false,
}: {
  effectivePlan: EffectivePlan;
  usage: OwnerUsage;
  showUpgradeAction?: boolean;
}) {
  const { t, locale } = useLocale();
  const { plan } = effectivePlan;
  const isBillingActive =
    effectivePlan.billingMode === "stripe"
    && effectivePlan.planEnforcementMode === "billing";
  const isUnlimitedMode =
    effectivePlan.planEnforcementMode === "unlimited"
    || plan.code === "unlimited"
    || plan.code === "self_hosted";
  const numberFormatter = (value: number) => formatNumber(value, locale);
  const bytesFormatter = (value: number) => formatBytes(value, locale);
  const usageCards: UsageMetric[] = [
    {
      key: "boards",
      labelKey: "usage.boards",
      used: usage.boards,
      limit: plan.limits.boards,
      formatter: numberFormatter,
    },
    {
      key: "images",
      labelKey: "usage.images",
      used: usage.images,
      limit: plan.limits.images,
      formatter: numberFormatter,
    },
  ];
  const storageMetric: UsageMetric = {
    key: "storage",
    labelKey: "usage.storage",
    used: usage.storageBytes,
    limit: plan.limits.storageBytes,
    formatter: bytesFormatter,
  };
  const monitoredMetrics = [...usageCards, storageMetric];
  const highestLevel = monitoredMetrics.reduce<UsageLevel>((current, metric) => {
    const next = usageLevel(metric.used, metric.limit);
    if (next === "over") return "over";
    if (next === "reached" && current !== "over") return "reached";
    if (next === "near" && current === "ok") return "near";
    return current;
  }, "ok");
  const storagePercent = progressValue(usage.storageBytes, plan.limits.storageBytes);
  const storageDegrees = Math.round((storagePercent / 100) * 360);
  const storageLevel = usageLevel(usage.storageBytes, plan.limits.storageBytes);
  const canShowUpgrade =
    showUpgradeAction
    && isBillingActive
    && !isUnlimitedMode
    && highestLevel !== "ok";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{t("usage.title")}</h2>
            <Badge variant={isUnlimitedMode ? "secondary" : "outline"}>
              {isUnlimitedMode ? t("billing.value.unlimited") : plan.name}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("usage.description")}
          </p>
        </div>
        {canShowUpgrade && (
          <Button onClick={() => { window.location.href = "/billing#plan-comparison"; }}>
            {t("usage.upgradeButton")}
          </Button>
        )}
      </div>

      {highestLevel !== "ok" && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
          highestLevel === "over"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : highestLevel === "reached"
              ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
        }`}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t(alertTitleKey(highestLevel))}</p>
            <p className="mt-1">{t(alertDescriptionKey(highestLevel))}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {usageCards.map((metric) => {
            const level = usageLevel(metric.used, metric.limit);
            const percent = progressValue(metric.used, metric.limit);
            return (
              <div
                key={metric.key}
                className={`rounded-lg border p-4 ${metricClass(level)}`}
              >
                <div className="space-y-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {metric.key === "boards" && <LayoutDashboard className="size-4 text-muted-foreground" />}
                    {metric.key === "images" && <ImageIcon className="size-4 text-muted-foreground" />}
                    <span className="min-w-0 text-sm font-medium">{t(metric.labelKey)}</span>
                  </div>
                  {level !== "ok" && (
                    <Badge
                      variant={level === "over" ? "destructive" : "secondary"}
                      className="max-w-full whitespace-normal text-left"
                    >
                      {t(badgeTextKey(level))}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-xl font-semibold">
                  {formatLimitValue(metric, t)}
                </p>
                {metric.limit !== null && (
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${progressClass(level)}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Video className="size-4 text-muted-foreground" />
              {t("usage.videos")}
            </div>
            <p className="mt-3 text-xl font-semibold">{formatNumber(usage.videos, locale)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.limits.videoEnabled ? t("usage.videoAvailable") : t("usage.videoUnavailable")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.25fr_0.75fr] lg:grid-cols-1 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive className="size-4 text-muted-foreground" />
                  {t("usage.storage")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatLimitValue(storageMetric, t)}
                </p>
              </div>
              <div
                className="grid size-24 shrink-0 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(${storageChartColor(storageLevel)} ${storageDegrees}deg, var(--muted) 0deg)`,
                }}
              >
                <div className="grid size-16 place-items-center rounded-full bg-card text-sm font-semibold">
                  {plan.limits.storageBytes === null
                    ? t("billing.value.unlimited")
                    : `${storagePercent}%`}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="size-4 text-muted-foreground" />
                {t("usage.maxUploadSize")}
              </div>
              <p className="mt-3 text-xl font-semibold">
                {plan.limits.maxUploadBytes === null
                  ? t("billing.value.unlimited")
                  : formatBytes(plan.limits.maxUploadBytes, locale)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{t("usage.watermark")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan.limits.watermark ? t("common.enabled") : t("common.disabled")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
