// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

interface RetroRowContent {
  left: string;
  right: string;
}

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

interface RetroBoardConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function RetroBoardConfigEditor({
  config,
  onChange,
}: RetroBoardConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();

  const displayColor = (config.displayColor as string) ?? "green";
  const rows = (config.rows as number) ?? 5;
  const fontSize = (config.fontSize as number) ?? 36;
  const flipSpeed = (config.flipSpeed as number) ?? 0.08;
  const switchInterval = (config.switchInterval as number) ?? 5;
  const showClock = (config.showClock as boolean) ?? false;
  const showWeather = (config.showWeather as boolean) ?? false;
  const fontFamily = (config.fontFamily as string) ?? "";
  const columnMode = ((config.columnMode as string) ?? "single") === "two" ? "two" : "single";
  const leftColumnPercent = (config.leftColumnPercent as number) ?? 50;
  const rowContents = normalizeRowContents(config.rowContents, rows);

  const colorLabels: Record<string, string> = {
    green: t("configEditor.green"),
    orange: t("configEditor.orange"),
    white: t("configEditor.white"),
  };

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateRows(value: number) {
    const nextRows = Math.min(20, Math.max(1, value || 5));
    onChange({
      ...config,
      rows: nextRows,
      rowContents: normalizeRowContents(config.rowContents, nextRows),
    });
  }

  function updateRowContent(index: number, key: keyof RetroRowContent, value: string) {
    onChange({
      ...config,
      rowContents: rowContents.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cfg-displayColor">{t("configEditor.displayColor")}</Label>
        <Select value={displayColor} onValueChange={(v) => update("displayColor", v)}>
          <SelectTrigger id="cfg-displayColor" className="w-full max-w-48">
            <SelectValue placeholder={t("configEditor.selectColor")}>{colorLabels[displayColor] ?? displayColor}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="green">
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full" style={{ backgroundColor: "#39ff14" }} />
                {t("configEditor.green")}
              </span>
            </SelectItem>
            <SelectItem value="orange">
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full" style={{ backgroundColor: "#ff8c00" }} />
                {t("configEditor.orange")}
              </span>
            </SelectItem>
            <SelectItem value="white">
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full border" style={{ backgroundColor: "#f0f0f0" }} />
                {t("configEditor.white")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-rows">{t("configEditor.rows")}</Label>
        <Input
          id="cfg-rows"
          type="number"
          min={1}
          max={20}
          value={rows}
          onChange={(e) =>
            updateRows(parseInt(e.target.value, 10))
          }
          className="w-24"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-fontSize">{t("configEditor.retroFontSize", { size: fontSize })}</Label>
        <Input
          id="cfg-fontSize"
          type="range"
          min={18}
          max={96}
          value={fontSize}
          onChange={(e) =>
            update("fontSize", Math.max(18, parseInt(e.target.value, 10) || 36))
          }
          className="w-full max-w-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-columnMode">{t("configEditor.retroColumnMode")}</Label>
        <Select value={columnMode} onValueChange={(v) => update("columnMode", v)}>
          <SelectTrigger id="cfg-columnMode" className="w-full max-w-48">
            <SelectValue>
              {columnMode === "two"
                ? t("configEditor.retroColumnTwo")
                : t("configEditor.retroColumnSingle")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">{t("configEditor.retroColumnSingle")}</SelectItem>
            <SelectItem value="two">{t("configEditor.retroColumnTwo")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("configEditor.retroColumnHint")}
        </p>
      </div>

      {columnMode === "two" && (
        <div className="space-y-1.5">
          <Label htmlFor="cfg-leftColumnPercent">
            {t("configEditor.retroLeftColumnWidth", { percent: leftColumnPercent })}
          </Label>
          <Input
            id="cfg-leftColumnPercent"
            type="range"
            min={20}
            max={80}
            step={5}
            value={leftColumnPercent}
            onChange={(e) =>
              update("leftColumnPercent", Math.min(80, Math.max(20, parseInt(e.target.value, 10) || 50)))
            }
            className="w-full max-w-sm"
          />
        </div>
      )}

      <div className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{t("configEditor.retroMessages")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("configEditor.retroMessagesHint")}
          </p>
        </div>

        <div className="space-y-3">
          {rowContents.map((row, index) => (
            <div
              key={index}
              className={
                columnMode === "two"
                  ? "grid gap-2 md:grid-cols-[88px_1fr_1fr]"
                  : "grid gap-2 md:grid-cols-[88px_1fr]"
              }
            >
              <div className="flex items-center text-sm font-medium text-muted-foreground">
                {t("configEditor.retroRowLabel", { number: index + 1 })}
              </div>
              <Input
                value={row.left}
                placeholder={
                  columnMode === "two"
                    ? t("configEditor.retroLeftColumn")
                    : t("configEditor.retroSingleColumnContent")
                }
                onChange={(e) => updateRowContent(index, "left", e.target.value)}
              />
              {columnMode === "two" && (
                <Input
                  value={row.right}
                  placeholder={t("configEditor.retroRightColumn")}
                  onChange={(e) => updateRowContent(index, "right", e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-flipSpeed">{t("configEditor.flipSpeed")}</Label>
        <Input
          id="cfg-flipSpeed"
          type="number"
          min={0.01}
          max={1}
          step={0.01}
          value={flipSpeed}
          onChange={(e) =>
            update("flipSpeed", Math.max(0.01, parseFloat(e.target.value) || 0.08))
          }
          className="w-24"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-switchInterval">{t("configEditor.switchInterval")}</Label>
        <Input
          id="cfg-switchInterval"
          type="number"
          min={1}
          max={300}
          value={switchInterval}
          onChange={(e) =>
            update("switchInterval", Math.max(1, parseInt(e.target.value, 10) || 5))
          }
          className="w-24"
        />
      </div>

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

      <div className="space-y-1.5">
        <Label htmlFor="cfg-font">{t("configEditor.font")}</Label>
        <Select
          value={fontFamily}
          onValueChange={(v) => update("fontFamily", v === "__default__" ? "" : v)}
        >
          <SelectTrigger id="cfg-font" className="w-full max-w-64">
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

function normalizeRowContents(value: unknown, rows: number): RetroRowContent[] {
  const rawRows = Array.isArray(value) ? value : [];
  return Array.from({ length: rows }, (_, index) => {
    const row = rawRows[index];
    if (!row || typeof row !== "object") {
      return { left: "", right: "" };
    }

    const raw = row as { left?: unknown; right?: unknown; text?: unknown };
    return {
      left:
        typeof raw.left === "string"
          ? raw.left
          : typeof raw.text === "string"
            ? raw.text
            : "",
      right: typeof raw.right === "string" ? raw.right : "",
    };
  });
}
