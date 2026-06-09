// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ClockCornerPlacementPicker,
  ClockWeatherPlacementPicker,
} from "@/components/dashboard/config-editors/ClockWeatherPlacementPicker";
import {
  normalizeClockWeatherState,
  type ClockWeatherState,
} from "@/components/board/ClockWeatherGroup";
import { GOOGLE_FONTS, buildGoogleFontsUrl } from "@/lib/fonts";
import { normalizeSlideshowTransition } from "@/lib/slideshow-transition";
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

interface PhotoClockConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function clockOnlyStateFromPosition(position: string): ClockWeatherState {
  if (
    position === "top-left"
    || position === "top-right"
    || position === "bottom-left"
    || position === "bottom-right"
  ) {
    return {
      anchor: position,
      arrangement: "vertical-clock-top",
    };
  }

  return {
    anchor: "bottom-right",
    arrangement: "vertical-clock-top",
  };
}

export function PhotoClockConfigEditor({
  config,
  onChange,
}: PhotoClockConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();

  const clockPosition = (config.clockPosition as string) ?? "bottom-right";
  const clockFontSize = (config.clockFontSize as number) ?? 48;
  const clockDateFontSize = (config.clockDateFontSize as number) ?? 18;
  const clockColor = (config.clockColor as string) ?? "#ffffff";
  const clockBgOpacity = (config.clockBgOpacity as number) ?? 0.5;
  const clockLayout = (config.clockLayout as string) ?? "standard";
  const clockWeatherState = normalizeClockWeatherState({
    anchor: config.clockWeatherAnchor,
    arrangement: config.clockWeatherArrangement,
    placement: config.clockWeatherPlacement,
    layout: config.clockWeatherLayout,
  });
  const is24Hour = (config.is24Hour as boolean) ?? true;
  const showWeather = (config.showWeather as boolean) ?? false;
  const weatherFontSize = (config.weatherFontSize as number) ?? 18;
  const objectFit = (config.objectFit as string) ?? "contain";
  const mediaTransition = normalizeSlideshowTransition(config.mediaTransition);
  const mediaTransitionLabel =
    mediaTransition === "crossfade"
      ? t("configEditor.mediaTransition.crossfade")
      : mediaTransition === "instant"
        ? t("configEditor.mediaTransition.instant")
        : t("configEditor.mediaTransition.fadeBlack");
  const randomPlayback = (config.randomPlayback as boolean) ?? false;
  const fontFamily = (config.fontFamily as string) ?? "";
  const clockOnlyState = clockOnlyStateFromPosition(clockPosition);

  const layoutLabels: Record<string, string> = {
    standard: t("configEditor.layoutStandard"),
    compact: t("configEditor.layoutCompact"),
    "large-time": t("configEditor.layoutLargeTime"),
    "date-top": t("configEditor.layoutDateTop"),
  };

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateClockWeatherState(value: ClockWeatherState) {
    onChange({
      ...config,
      clockWeatherAnchor: value.anchor,
      clockWeatherArrangement: value.arrangement,
    });
  }

  function updateClockOnlyPosition(value: ClockWeatherState) {
    const nextPosition =
      value.anchor === "top-left"
      || value.anchor === "top-right"
      || value.anchor === "bottom-left"
      || value.anchor === "bottom-right"
        ? value.anchor
        : "bottom-right";
    update("clockPosition", nextPosition);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cfg-objectFit">{t("configEditor.mediaMode")}</Label>
        <Select value={objectFit} onValueChange={(v) => update("objectFit", v)}>
          <SelectTrigger id="cfg-objectFit" className="w-full sm:max-w-72">
            <SelectValue>{objectFit === "cover" ? t("configEditor.objectFitCover") : t("configEditor.objectFitContain")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contain">{t("configEditor.objectFitContain")}</SelectItem>
            <SelectItem value="cover">{t("configEditor.objectFitCover")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Switch
          id="cfg-randomPlayback"
          checked={randomPlayback}
          onCheckedChange={(v) => update("randomPlayback", v)}
        />
        <Label htmlFor="cfg-randomPlayback" className="min-w-0 flex-1 leading-snug">
          {t("configEditor.randomPlayback")}
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-mediaTransition">
          {t("configEditor.mediaTransition")}
        </Label>
        <Select
          value={mediaTransition}
          onValueChange={(v) => update("mediaTransition", v)}
        >
          <SelectTrigger id="cfg-mediaTransition" className="w-full sm:max-w-72">
            <SelectValue>{mediaTransitionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fade-black">
              {t("configEditor.mediaTransition.fadeBlack")}
            </SelectItem>
            <SelectItem value="crossfade">
              {t("configEditor.mediaTransition.crossfade")}
            </SelectItem>
            <SelectItem value="instant">
              {t("configEditor.mediaTransition.instant")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!showWeather && (
        <div className="space-y-1.5">
          <Label>{t("configEditor.clockPosition")}</Label>
          <ClockCornerPlacementPicker
            value={clockOnlyState}
            onChange={updateClockOnlyPosition}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cfg-clockLayout">{t("configEditor.clockLayout")}</Label>
        <Select value={clockLayout} onValueChange={(v) => update("clockLayout", v)}>
          <SelectTrigger id="cfg-clockLayout" className="w-full sm:max-w-64">
            <SelectValue placeholder={t("configEditor.selectLayout")}>{layoutLabels[clockLayout] ?? clockLayout}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">{t("configEditor.layoutStandard")}</SelectItem>
            <SelectItem value="compact">{t("configEditor.layoutCompact")}</SelectItem>
            <SelectItem value="large-time">{t("configEditor.layoutLargeTime")}</SelectItem>
            <SelectItem value="date-top">{t("configEditor.layoutDateTop")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-clockSize">{t("configEditor.clockFontSize", { size: clockFontSize })}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="cfg-clockSize"
            type="range"
            min={24}
            max={160}
            step={4}
            value={clockFontSize}
            onChange={(e) => update("clockFontSize", parseInt(e.target.value, 10))}
            className="w-full sm:max-w-64"
          />
          <NumberInput
            aria-label={t("configEditor.clockFontSize", { size: clockFontSize })}
            min={24}
            max={160}
            step={4}
            value={clockFontSize}
            onValueChange={(value) => update("clockFontSize", value)}
            className="w-full sm:w-24"
          />
        </div>
        <div className="flex w-full justify-between text-xs text-muted-foreground sm:max-w-64">
          <span>24pt</span>
          <span>160pt</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-clockDateSize">
          {t("configEditor.clockDateFontSize", { size: clockDateFontSize })}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="cfg-clockDateSize"
            type="range"
            min={10}
            max={80}
            step={1}
            value={clockDateFontSize}
            onChange={(e) => update("clockDateFontSize", parseInt(e.target.value, 10))}
            className="w-full sm:max-w-64"
          />
          <NumberInput
            aria-label={t("configEditor.clockDateFontSize", { size: clockDateFontSize })}
            min={10}
            max={80}
            step={1}
            value={clockDateFontSize}
            onValueChange={(value) => update("clockDateFontSize", value)}
            className="w-full sm:w-24"
          />
        </div>
        <div className="flex w-full justify-between text-xs text-muted-foreground sm:max-w-64">
          <span>10pt</span>
          <span>80pt</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-clockColor">{t("configEditor.clockTextColor")}</Label>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <input
            type="color"
            id="cfg-clockColor"
            value={clockColor}
            onChange={(e) => update("clockColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border"
          />
          <Input
            value={clockColor}
            onChange={(e) => update("clockColor", e.target.value)}
            className="w-full font-mono text-sm sm:w-28"
            maxLength={7}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-clockOpacity">
          {t("configEditor.clockBgOpacity", { percent: Math.round(clockBgOpacity * 100) })}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="cfg-clockOpacity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clockBgOpacity}
            onChange={(e) => update("clockBgOpacity", parseFloat(e.target.value))}
            className="w-full sm:max-w-48"
          />
          <NumberInput
            aria-label={t("configEditor.clockBgOpacity", {
              percent: Math.round(clockBgOpacity * 100),
            })}
            min={0}
            max={1}
            step={0.05}
            allowDecimal
            value={clockBgOpacity}
            onValueChange={(value) => update("clockBgOpacity", value)}
            className="w-full sm:w-24"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Switch
          id="cfg-24h"
          checked={is24Hour}
          onCheckedChange={(v) => update("is24Hour", v)}
        />
        <Label htmlFor="cfg-24h" className="min-w-0 flex-1 leading-snug">
          {t("configEditor.twentyFourHour")}
        </Label>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Switch
          id="cfg-weather"
          checked={showWeather}
          onCheckedChange={(v) => update("showWeather", v)}
        />
        <Label htmlFor="cfg-weather" className="min-w-0 flex-1 leading-snug">
          {t("configEditor.showWeather")}
        </Label>
      </div>
      {showWeather && (
        <div className="space-y-3">
          <p className="break-words text-xs text-muted-foreground">
            {t("configEditor.weatherHint")}
          </p>
          <div className="space-y-1.5">
            <Label>
              {t("configEditor.clockWeatherLayout")}
            </Label>
            <ClockWeatherPlacementPicker
              value={clockWeatherState}
              onChange={updateClockWeatherState}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-weatherSize">
              {t("configEditor.weatherFontSize", { size: weatherFontSize })}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="cfg-weatherSize"
                type="range"
                min={12}
                max={56}
                step={1}
                value={weatherFontSize}
                onChange={(e) => update("weatherFontSize", parseInt(e.target.value, 10))}
                className="w-full sm:max-w-64"
              />
              <NumberInput
                aria-label={t("configEditor.weatherFontSize", { size: weatherFontSize })}
                min={12}
                max={56}
                step={1}
                value={weatherFontSize}
                onValueChange={(value) => update("weatherFontSize", value)}
                className="w-full sm:w-24"
              />
            </div>
            <div className="flex w-full justify-between text-xs text-muted-foreground sm:max-w-64">
              <span>12pt</span>
              <span>56pt</span>
            </div>
          </div>
        </div>
      )}

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
