// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, Copy, Check } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

function generatePasscode(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join(
    "",
  );
}

interface CallScreenAdminProps {
  boardId: string;
  config: Record<string, unknown>;
  onUpdateConfig: (config: Record<string, unknown>) => void;
}

export default function CallScreenAdmin({
  boardId,
  config,
  onUpdateConfig,
}: CallScreenAdminProps) {
  const { t } = useLocale();
  const [networkOrigin, setNetworkOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  const passcode = (config.passcode as string) ?? "";

  // Fetch local network IP for the URL
  useEffect(() => {
    (async () => {
      const origin = window.location.origin;
      const hostname = window.location.hostname;

      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        setNetworkOrigin(origin);
        return;
      }

      try {
        const res = await fetch("/api/network");
        if (!res.ok) {
          setNetworkOrigin(origin);
          return;
        }
        const data = await res.json();
        if (data.ip) {
          const port = window.location.port;
          const protocol = window.location.protocol;
          setNetworkOrigin(`${protocol}//${data.ip}${port ? `:${port}` : ""}`);
        } else {
          setNetworkOrigin(origin);
        }
      } catch {
        setNetworkOrigin(origin);
      }
    })();
  }, []);

  // Auto-generate passcode if empty
  useEffect(() => {
    if (!passcode) {
      onUpdateConfig({ ...config, passcode: generatePasscode() });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = useCallback(() => {
    onUpdateConfig({ ...config, passcode: generatePasscode() });
  }, [config, onUpdateConfig]);

  const callUrl = `${networkOrigin}/call/${boardId}`;
  const callUrlWithPasscode = `${callUrl}?passcode=${passcode}`;

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(callUrlWithPasscode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("call.adminTitle")}</CardTitle>
        <CardDescription>
          {t("call.adminDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Passcode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("call.adminPasscodeLabel")}</label>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="max-w-full overflow-hidden rounded-lg border bg-muted px-4 py-2 font-mono text-lg tracking-[0.18em] break-all sm:text-2xl sm:tracking-[0.3em]">
              {passcode || "------"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              {t("call.adminRegenerate")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("call.adminPasscodeHint")}
          </p>
        </div>

        {/* URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("call.adminUrlLabel")}</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block min-w-0 w-full overflow-hidden text-ellipsis rounded-lg border bg-muted px-3 py-2 text-xs sm:flex-1">
              {callUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleCopyUrl}
            >
              {copied ? (
                <Check className="mr-1.5 size-3.5 text-green-600" />
              ) : (
                <Copy className="mr-1.5 size-3.5" />
              )}
              {copied ? t("call.adminCopied") : t("call.adminCopyWithPasscode")}
            </Button>
          </div>
        </div>

        {/* QR Code */}
        {networkOrigin && passcode && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("call.adminQrLabel")}
            </label>
            <div className="inline-block max-w-full overflow-hidden rounded-xl border bg-white p-3 sm:p-4">
              <QRCodeSVG
                value={callUrlWithPasscode}
                size={200}
                level="M"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("call.adminQrHint")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
