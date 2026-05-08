// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOOGLE_FONTS, buildGoogleFontsUrl } from "@/lib/fonts";

export function useLoadAllGoogleFonts() {
  useEffect(() => {
    const families = GOOGLE_FONTS.map((f) => f.value).filter(Boolean);
    const url = buildGoogleFontsUrl(families);
    if (!url) return;

    const linkId = "google-fonts-all";
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, []);
}

export function FontSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("configEditor.font")}</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (!next) return;
          onChange(next === "__default__" ? "" : next);
        }}
      >
        <SelectTrigger id={id} className="w-full max-w-64">
          <SelectValue placeholder={t("configEditor.fontPlaceholder")}>
            {GOOGLE_FONTS.find((f) => f.value === value)?.label ?? t("common.default")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {GOOGLE_FONTS.map((font) => (
            <SelectItem
              key={font.value || "__default__"}
              value={font.value || "__default__"}
              style={font.value ? { fontFamily: font.value } : undefined}
            >
              {font.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
