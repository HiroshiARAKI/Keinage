// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

interface VersionInfo {
  current: string;
  releaseUrl: string;
  latest: string | null;
  latestUrl: string | null;
  hasUpdate: boolean;
}

export function VersionInfoPanel() {
  const { t } = useLocale();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setVersionInfo(data);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="rounded-lg border bg-card p-6 text-card-foreground">
      <div className="flex items-center gap-2">
        <Info className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("settings.versionTitle")}</h2>
      </div>

      {!versionInfo && (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {versionInfo && (
        <div className="mt-4 space-y-2">
          <p className="text-sm">
            {t("settings.currentVersion")}{" "}
            <a
              href={versionInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold text-blue-600 hover:underline"
            >
              v{versionInfo.current}
            </a>
          </p>
          {versionInfo.hasUpdate && versionInfo.latest && (
            <p className="text-sm text-amber-600">
              {t("settings.updateAvailable")}{" "}
              <a
                href={versionInfo.latestUrl ?? versionInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold hover:underline"
              >
                v{versionInfo.latest}
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
