// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GOOGLE_FONTS, buildGoogleFontsUrl } from "@/lib/fonts";
import { useEffect } from "react";

/** Load ALL Google Fonts so the dropdown and preview can display them */
function useLoadAllGoogleFonts() {
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

interface MessageBoardConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function MessageBoardConfigEditor({
  config,
  onChange,
}: MessageBoardConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();

  const maxDisplayCount = (config.maxDisplayCount as number) ?? 10;
  const fontSize = (config.fontSize as number) ?? 20;
  const backgroundColor = (config.backgroundColor as string) ?? "#1e293b";
  const textColor = (config.textColor as string) ?? "#f8fafc";
  const accentColor = (config.accentColor as string) ?? "#3b82f6";
  const showClock = (config.showClock as boolean) ?? false;
  const showWeather = (config.showWeather as boolean) ?? false;
  const fontFamily = (config.fontFamily as string) ?? "";
  const timestampSize = (config.timestampSize as string) === "small" || (config.timestampSize as string) === "large"
    ? (config.timestampSize as string)
    : "medium";

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Switch
          id="cfg-showClock"
          checked={showClock}
          onCheckedChange={(v) => update("showClock", v)}
        />
        <Label htmlFor="cfg-showClock" className="min-w-0 flex-1 leading-snug">
          {t("configEditor.showClock")}
        </Label>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Switch
          id="cfg-showWeather"
          checked={showWeather}
          onCheckedChange={(v) => update("showWeather", v)}
        />
        <Label htmlFor="cfg-showWeather" className="min-w-0 flex-1 leading-snug">
          {t("configEditor.showWeather")}
        </Label>
      </div>
      {showWeather && (
        <p className="break-words text-xs text-muted-foreground">
          {t("configEditor.weatherHint")}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cfg-maxDisplay">{t("configEditor.maxDisplayCount")}</Label>
        <NumberInput
          id="cfg-maxDisplay"
          min={1}
          max={100}
          value={maxDisplayCount}
          onValueChange={(value) => update("maxDisplayCount", value)}
          className="w-full sm:w-24"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-fontSize">{t("configEditor.fontSize", { size: fontSize })}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="cfg-fontSize"
            type="range"
            min={12}
            max={48}
            step={1}
            value={fontSize}
            onChange={(e) => update("fontSize", Number(e.target.value))}
            className="w-full sm:max-w-48"
          />
          <NumberInput
            aria-label={t("configEditor.fontSize", { size: fontSize })}
            min={12}
            max={48}
            value={fontSize}
            onValueChange={(value) => update("fontSize", value)}
            className="w-full sm:w-24"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-timestampSize">{t("configEditor.messageTimestampSize")}</Label>
        <Select value={timestampSize} onValueChange={(v) => update("timestampSize", v)}>
          <SelectTrigger id="cfg-timestampSize" className="w-full sm:max-w-48">
            <SelectValue>
              {timestampSize === "large"
                ? t("configEditor.sizeLarge")
                : timestampSize === "small"
                  ? t("configEditor.sizeSmall")
                  : t("configEditor.sizeMedium")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">{t("configEditor.sizeSmall")}</SelectItem>
            <SelectItem value="medium">{t("configEditor.sizeMedium")}</SelectItem>
            <SelectItem value="large">{t("configEditor.sizeLarge")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-bgColor">{t("configEditor.backgroundColor")}</Label>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <input
            type="color"
            id="cfg-bgColor"
            value={backgroundColor}
            onChange={(e) => update("backgroundColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border"
          />
          <Input
            value={backgroundColor}
            onChange={(e) => update("backgroundColor", e.target.value)}
            className="w-full font-mono text-sm sm:w-28"
            maxLength={7}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-textColor">{t("configEditor.textColor")}</Label>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <input
            type="color"
            id="cfg-textColor"
            value={textColor}
            onChange={(e) => update("textColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border"
          />
          <Input
            value={textColor}
            onChange={(e) => update("textColor", e.target.value)}
            className="w-full font-mono text-sm sm:w-28"
            maxLength={7}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-accentColor">{t("configEditor.accentColor")}</Label>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <input
            type="color"
            id="cfg-accentColor"
            value={accentColor}
            onChange={(e) => update("accentColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border"
          />
          <Input
            value={accentColor}
            onChange={(e) => update("accentColor", e.target.value)}
            className="w-full font-mono text-sm sm:w-28"
            maxLength={7}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-font">{t("configEditor.font")}</Label>
        <Select
          value={fontFamily}
          onValueChange={(v) => update("fontFamily", v === "__default__" ? "" : v)}
        >
          <SelectTrigger id="cfg-font" className="w-full sm:max-w-64">
            <SelectValue placeholder={t("configEditor.fontPlaceholder")}>
              {GOOGLE_FONTS.find((f) => f.value === fontFamily)?.label ?? t("common.default")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GOOGLE_FONTS.map((f) => (
              <SelectItem
                key={f.value || "__default__"}
                value={f.value || "__default__"}
                style={f.value ? { fontFamily: f.value } : undefined}
              >
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
