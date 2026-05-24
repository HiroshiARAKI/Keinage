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

/** Ticker color/style presets */
const TICKER_PRESETS = [
  { labelKey: "configEditor.darkDefault", textColor: "#ffffff", tickerBgColor: "#1a1a2e" },
  { labelKey: "configEditor.whiteBackground", textColor: "#1a1a2e", tickerBgColor: "#ffffff" },
  { labelKey: "configEditor.neonBlue", textColor: "#00e5ff", tickerBgColor: "#0d1117" },
  { labelKey: "configEditor.neonGreen", textColor: "#39ff14", tickerBgColor: "#0a0a0a" },
  { labelKey: "configEditor.sunset", textColor: "#ffffff", tickerBgColor: "#e65100" },
  { labelKey: "configEditor.royalBlue", textColor: "#ffd700", tickerBgColor: "#1a237e" },
  { labelKey: "configEditor.cherry", textColor: "#ffffff", tickerBgColor: "#c2185b" },
  { labelKey: "configEditor.forest", textColor: "#e8f5e9", tickerBgColor: "#1b5e20" },
] as const;

interface SimpleBoardConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function SimpleBoardConfigEditor({
  config,
  onChange,
}: SimpleBoardConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();

  const slideInterval = (config.slideInterval as number) ?? 5;
  const tickerSpeed = (config.tickerSpeed as number) ?? 60;
  const backgroundColor = (config.backgroundColor as string) ?? "#000000";
  const textColor = (config.textColor as string) ?? "#ffffff";
  const tickerBgColor = (config.tickerBgColor as string) ?? "#1a1a2e";
  const tickerFontFamily = (config.tickerFontFamily as string) ?? "";
  const tickerFontSize = (config.tickerFontSize as number) ?? 18;
  const tickerPosition = (config.tickerPosition as string) ?? "bottom";
  const showClock = (config.showClock as boolean) ?? false;
  const showWeather = (config.showWeather as boolean) ?? false;
  const objectFit = (config.objectFit as string) ?? "contain";
  const videoAdvanceMode = (config.videoAdvanceMode as string) === "until-ended"
    ? "until-ended"
    : "duration";

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function applyPreset(preset: (typeof TICKER_PRESETS)[number]) {
    onChange({
      ...config,
      textColor: preset.textColor,
      tickerBgColor: preset.tickerBgColor,
    });
  }

  return (
    <div className="space-y-6">
      {/* Clock & Weather */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.clockAndWeather")}</h4>
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <Switch
              id="cfg-showClock"
              checked={showClock}
              onCheckedChange={(v) => update("showClock", v)}
            />
            <Label htmlFor="cfg-showClock">{t("configEditor.showClock")}</Label>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Switch
              id="cfg-showWeather"
              checked={showWeather}
              onCheckedChange={(v) => update("showWeather", v)}
            />
            <Label htmlFor="cfg-showWeather">{t("configEditor.showWeather")}</Label>
          </div>
          {showWeather && (
            <p className="text-xs text-muted-foreground">
              {t("configEditor.weatherHint")}
            </p>
          )}
        </div>
      </div>

      {/* Slideshow settings */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.slideshowSection")}</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-slideInterval">{t("configEditor.slideInterval")}</Label>
            <NumberInput
              id="cfg-slideInterval"
              min={1}
              max={300}
              value={slideInterval}
              onValueChange={(value) => update("slideInterval", value)}
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-videoAdvanceMode">{t("configEditor.videoAdvanceMode")}</Label>
            <Select
              value={videoAdvanceMode}
              onValueChange={(v) => update("videoAdvanceMode", v)}
            >
              <SelectTrigger id="cfg-videoAdvanceMode" className="w-full max-w-72">
                <SelectValue>
                  {videoAdvanceMode === "until-ended"
                    ? t("configEditor.videoAdvance.untilEnded")
                    : t("configEditor.videoAdvance.duration")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="duration">{t("configEditor.videoAdvance.duration")}</SelectItem>
                <SelectItem value="until-ended">{t("configEditor.videoAdvance.untilEnded")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-objectFit">{t("configEditor.mediaMode")}</Label>
            <Select value={objectFit} onValueChange={(v) => update("objectFit", v)}>
              <SelectTrigger id="cfg-objectFit" className="w-full max-w-72">
                <SelectValue>{objectFit === "cover" ? t("configEditor.objectFitCover") : t("configEditor.objectFitContain")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">{t("configEditor.objectFitContain")}</SelectItem>
                <SelectItem value="cover">{t("configEditor.objectFitCover")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-bgColor">{t("configEditor.backgroundColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
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
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ticker settings */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.tickerSection")}</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-tickerSpeed">{t("configEditor.tickerSpeed")}</Label>
            <NumberInput
              id="cfg-tickerSpeed"
              min={10}
              max={500}
              value={tickerSpeed}
              onValueChange={(value) => update("tickerSpeed", value)}
              className="w-24"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-tickerFontSize">{t("configEditor.tickerFontSize", { size: tickerFontSize })}</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="cfg-tickerFontSize"
                type="range"
                min={12}
                max={64}
                step={1}
                value={tickerFontSize}
                onChange={(e) => update("tickerFontSize", Number(e.target.value))}
                className="w-full max-w-48"
              />
              <NumberInput
                aria-label={t("configEditor.tickerFontSize", { size: tickerFontSize })}
                min={12}
                max={64}
                value={tickerFontSize}
                onValueChange={(value) => update("tickerFontSize", value)}
                className="w-24"
              />
            </div>
            <div className="flex w-full max-w-48 justify-between text-xs text-muted-foreground">
              <span>12px</span>
              <span>64px</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-tickerPosition">{t("configEditor.displayPosition")}</Label>
            <Select value={tickerPosition} onValueChange={(v) => update("tickerPosition", v)}>
              <SelectTrigger id="cfg-tickerPosition" className="w-full max-w-48">
                <SelectValue>{tickerPosition === "top" ? t("configEditor.positionTop") : t("configEditor.positionBottom")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">{t("configEditor.positionBottom")}</SelectItem>
                <SelectItem value="top">{t("configEditor.positionTop")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-textColor">{t("configEditor.textColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
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
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-tickerBg">{t("configEditor.backgroundColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                id="cfg-tickerBg"
                value={tickerBgColor}
                onChange={(e) => update("tickerBgColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={tickerBgColor}
                onChange={(e) => update("tickerBgColor", e.target.value)}
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <Label>{t("configEditor.preview")}</Label>
            <div
              className="flex h-10 items-center overflow-hidden rounded-md border px-3 text-sm font-medium"
              style={{
                color: textColor,
                backgroundColor: tickerBgColor,
                fontFamily: tickerFontFamily || undefined,
              }}
            >
              {t("configEditor.previewSample")}
            </div>
          </div>

          {/* Color presets */}
          <div className="space-y-1.5">
            <Label>{t("configEditor.colorPresets")}</Label>
            <div className="flex flex-wrap gap-2">
              {TICKER_PRESETS.map((preset) => (
                <button
                  key={preset.labelKey}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent"
                >
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: preset.tickerBgColor }}
                  />
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: preset.textColor }}
                  />
                  {t(preset.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Font family */}
          <div className="space-y-1.5">
            <Label htmlFor="cfg-font">{t("configEditor.font")}</Label>
            <Select
              value={tickerFontFamily}
              onValueChange={(v) => update("tickerFontFamily", v === "__default__" ? "" : v)}
            >
              <SelectTrigger id="cfg-font" className="w-full max-w-64">
                <SelectValue placeholder={t("configEditor.fontPlaceholder")}>
                  {GOOGLE_FONTS.find((f) => f.value === tickerFontFamily)?.label ?? t("common.default")}
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
      </div>
    </div>
  );
}
