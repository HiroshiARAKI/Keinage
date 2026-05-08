// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/LocaleProvider";

const REFRESH_INTERVAL_MS = 60 * 1000;

interface BoardDeviceStatus {
  id: string;
  boardId: string;
  boardName: string;
  userAgent: string | null;
  lastSeenAt: string;
  online: boolean;
}

interface BoardDeviceStatusResponse {
  enabled: boolean;
  devices: BoardDeviceStatus[];
  onlineThresholdSeconds: number;
  planName: string;
}

export function BoardDeviceStatusPanel() {
  const { t, formatDateTime } = useLocale();
  const [data, setData] = useState<BoardDeviceStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/board-devices", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(t("deviceStatus.fetchFailed"));
      }
      const nextData = await response.json() as BoardDeviceStatusResponse;
      setData(nextData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("deviceStatus.fetchFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    load("initial");
    const interval = window.setInterval(() => load("refresh"), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const devices = data?.devices ?? [];

  return (
    <section className="rounded-lg border bg-card p-6 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("deviceStatus.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("deviceStatus.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => load("refresh")}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {t("deviceStatus.refresh")}
        </Button>
      </div>

      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && data && !data.enabled && (
        <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("deviceStatus.unavailable", { plan: data.planName })}
        </div>
      )}

      {!loading && !error && data?.enabled && devices.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("deviceStatus.empty")}
        </div>
      )}

      {!loading && !error && data?.enabled && devices.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">{t("deviceStatus.status")}</th>
                <th className="py-2 pr-4 font-medium">{t("deviceStatus.lastSeen")}</th>
                <th className="py-2 pr-4 font-medium">{t("deviceStatus.board")}</th>
                <th className="py-2 font-medium">{t("deviceStatus.userAgent")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className="py-3 pr-4">
                    <Badge
                      variant={device.online ? "default" : "secondary"}
                      className={device.online ? "bg-emerald-600 text-white" : ""}
                    >
                      {device.online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                      {device.online ? t("deviceStatus.online") : t("deviceStatus.offline")}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {formatDateTime(device.lastSeenAt)}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{device.boardName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{device.boardId}</div>
                  </td>
                  <td className="max-w-[28rem] py-3">
                    <span className="line-clamp-2 break-all text-muted-foreground">
                      {device.userAgent ?? t("deviceStatus.userAgentUnknown")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
