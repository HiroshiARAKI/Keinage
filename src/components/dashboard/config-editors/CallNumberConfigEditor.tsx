// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Color presets for Light / Dark themes */
const COLOR_PRESETS = [
  {
    labelKey: "configEditor.darkDefault",
    backgroundColor: "#1a1a2e",
    waitingTextColor: "#ffffff",
    calledTextColor: "#00ff88",
    highlightColor: "#ff6b35",
  },
  {
    labelKey: "configEditor.light",
    backgroundColor: "#f5f5f5",
    waitingTextColor: "#333333",
    calledTextColor: "#16a34a",
    highlightColor: "#dc2626",
  },
  {
    labelKey: "configEditor.navy",
    backgroundColor: "#0f172a",
    waitingTextColor: "#e2e8f0",
    calledTextColor: "#38bdf8",
    highlightColor: "#f59e0b",
  },
  {
    labelKey: "configEditor.hospitalGreen",
    backgroundColor: "#ecfdf5",
    waitingTextColor: "#1e3a2f",
    calledTextColor: "#059669",
    highlightColor: "#dc2626",
  },
] as const;

interface CallNumberConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function CallNumberConfigEditor({
  config,
  onChange,
}: CallNumberConfigEditorProps) {
  const { t } = useLocale();
  const showClock = (config.showClock as boolean) ?? true;
  const backgroundColor = (config.backgroundColor as string) ?? "#1a1a2e";
  const waitingTextColor = (config.waitingTextColor as string) ?? "#ffffff";
  const calledTextColor = (config.calledTextColor as string) ?? "#00ff88";
  const highlightColor = (config.highlightColor as string) ?? "#ff6b35";
  const layout = (config.layout as string) ?? "horizontal";
  const calledExpireMinutes = (config.calledExpireMinutes as number) ?? 5;
  const numberFontSize = (config.numberFontSize as number) ?? 60;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function applyPreset(preset: (typeof COLOR_PRESETS)[number]) {
    onChange({
      ...config,
      backgroundColor: preset.backgroundColor,
      waitingTextColor: preset.waitingTextColor,
      calledTextColor: preset.calledTextColor,
      highlightColor: preset.highlightColor,
    });
  }

  return (
    <div className="space-y-6">
      {/* Clock */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.clockSection")}</h4>
        <div className="flex flex-wrap items-start gap-3">
          <Switch
            id="cfg-showClock"
            checked={showClock}
            onCheckedChange={(v) => update("showClock", v)}
          />
          <Label htmlFor="cfg-showClock">{t("configEditor.showClock")}</Label>
        </div>
      </div>

      {/* Layout */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.layoutSection")}</h4>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-layout">{t("configEditor.laneLayout")}</Label>
          <Select value={layout} onValueChange={(v) => update("layout", v)}>
            <SelectTrigger id="cfg-layout" className="w-full max-w-48">
              <SelectValue>
                {layout === "horizontal" ? t("configEditor.horizontalLayout") : t("configEditor.verticalLayout")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">{t("configEditor.horizontalLayout")}</SelectItem>
              <SelectItem value="vertical">{t("configEditor.verticalLayout")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Number display */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.numberDisplaySection")}</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-numberFontSize">{t("configEditor.numberFontSize", { size: numberFontSize })}</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="cfg-numberFontSize"
                type="range"
                min={24}
                max={120}
                step={2}
                value={numberFontSize}
                onChange={(e) => update("numberFontSize", Number(e.target.value))}
                className="w-full max-w-48"
              />
              <NumberInput
                aria-label={t("configEditor.numberFontSize", { size: numberFontSize })}
                min={24}
                max={120}
                step={2}
                value={numberFontSize}
                onValueChange={(value) => update("numberFontSize", value)}
                className="w-full sm:w-24"
              />
            </div>
            <div className="flex w-full max-w-48 justify-between text-xs text-muted-foreground">
              <span>24pt</span>
              <span>120pt</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-calledExpire">{t("configEditor.calledExpire")}</Label>
            <NumberInput
              id="cfg-calledExpire"
              min={1}
              max={60}
              value={calledExpireMinutes}
              onValueChange={(value) => update("calledExpireMinutes", value)}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              {t("configEditor.calledExpireHint")}
            </p>
          </div>
        </div>
      </div>

      {/* Color presets */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.colorPresets")}</h4>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <Button
              key={preset.labelKey}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset)}
              className="gap-2"
            >
              <span
                className="inline-block size-3 rounded-full border"
                style={{ backgroundColor: preset.backgroundColor }}
              />
              {t(preset.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.colorSettings")}</h4>
        <div className="space-y-3">
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

          <div className="space-y-1.5">
            <Label htmlFor="cfg-waitingColor">{t("configEditor.waitingTextColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                id="cfg-waitingColor"
                value={waitingTextColor}
                onChange={(e) => update("waitingTextColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={waitingTextColor}
                onChange={(e) => update("waitingTextColor", e.target.value)}
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-calledColor">{t("configEditor.calledTextColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                id="cfg-calledColor"
                value={calledTextColor}
                onChange={(e) => update("calledTextColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={calledTextColor}
                onChange={(e) => update("calledTextColor", e.target.value)}
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-highlightColor">{t("configEditor.highlightColor")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                id="cfg-highlightColor"
                value={highlightColor}
                onChange={(e) => update("highlightColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={highlightColor}
                onChange={(e) => update("highlightColor", e.target.value)}
                className="w-28 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
