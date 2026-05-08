// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FontSelect, numberValue, useLoadAllGoogleFonts } from "./shared";
import { Trash2 } from "lucide-react";

interface ClinicDayConfig {
  weekday: number;
  closed: boolean;
  morning: string;
  afternoon: string;
}

interface ClinicDateOverride extends ClinicDayConfig {
  date: string;
}

const weekdays = [
  { value: 0, key: "schedule.weekday.sun" },
  { value: 1, key: "schedule.weekday.mon" },
  { value: 2, key: "schedule.weekday.tue" },
  { value: 3, key: "schedule.weekday.wed" },
  { value: 4, key: "schedule.weekday.thu" },
  { value: 5, key: "schedule.weekday.fri" },
  { value: 6, key: "schedule.weekday.sat" },
] as const;

const defaultDays: ClinicDayConfig[] = [
  { weekday: 0, closed: true, morning: "", afternoon: "" },
  { weekday: 1, closed: false, morning: "09:00-12:00", afternoon: "14:00-18:00" },
  { weekday: 2, closed: false, morning: "09:00-12:00", afternoon: "14:00-18:00" },
  { weekday: 3, closed: false, morning: "09:00-12:00", afternoon: "14:00-18:00" },
  { weekday: 4, closed: false, morning: "09:00-12:00", afternoon: "14:00-18:00" },
  { weekday: 5, closed: false, morning: "09:00-12:00", afternoon: "14:00-18:00" },
  { weekday: 6, closed: false, morning: "09:00-12:00", afternoon: "" },
];

interface ClinicHoursConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ClinicHoursConfigEditor({
  config,
  onChange,
}: ClinicHoursConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const days = normalizeDays(config.days);
  const specialDates = normalizeSpecialDates(config.specialDates);
  const daysToShow = numberValue(config.daysToShow, 14);
  const fontFamily = (config.fontFamily as string) ?? "";
  const showClock = (config.showClock as boolean) ?? false;
  const showWeather = (config.showWeather as boolean) ?? false;
  const weekStartsOn = ((config.weekStartsOn as string) ?? "sun") === "mon" ? "mon" : "sun";

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateDay(weekday: number, patch: Partial<ClinicDayConfig>) {
    update(
      "days",
      days.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    );
  }

  function updateSpecialDate(index: number, patch: Partial<ClinicDateOverride>) {
    update(
      "specialDates",
      specialDates.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function addSpecialDate() {
    const today = new Date();
    const value = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    update("specialDates", [
      ...specialDates,
      { date: value, weekday: 0, closed: true, morning: "", afternoon: "" },
    ]);
  }

  function removeSpecialDate(index: number) {
    update("specialDates", specialDates.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-titleText">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-titleText"
            value={(config.title as string) ?? "診療時間のご案内"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-bodyText">{t("configEditor.bodyText")}</Label>
          <Input
            id="cfg-bodyText"
            value={(config.body as string) ?? "受付時間は状況により変更になる場合があります。"}
            onChange={(e) => update("body", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-daysToShow">{t("configEditor.daysToShow")}</Label>
          <Input
            id="cfg-daysToShow"
            type="number"
            min={7}
            max={31}
            value={daysToShow}
            onChange={(e) =>
              update("daysToShow", Math.min(31, Math.max(7, parseInt(e.target.value, 10) || 14)))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-weekStartsOn">{t("configEditor.weekStartsOn")}</Label>
          <Select
            value={weekStartsOn}
            onValueChange={(value) => {
              if (!value) return;
              update("weekStartsOn", value);
            }}
          >
            <SelectTrigger id="cfg-weekStartsOn">
              <SelectValue>
                {weekStartsOn === "mon"
                  ? t("configEditor.weekStartsMonday")
                  : t("configEditor.weekStartsSunday")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sun">{t("configEditor.weekStartsSunday")}</SelectItem>
              <SelectItem value="mon">{t("configEditor.weekStartsMonday")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FontSelect
          id="cfg-clinic-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-md border p-3">
          <Switch
            id="cfg-clinic-showClock"
            checked={showClock}
            onCheckedChange={(value) => update("showClock", value)}
          />
          <Label htmlFor="cfg-clinic-showClock">{t("configEditor.showClock")}</Label>
        </div>
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-3">
            <Switch
              id="cfg-clinic-showWeather"
              checked={showWeather}
              onCheckedChange={(value) => update("showWeather", value)}
            />
            <Label htmlFor="cfg-clinic-showWeather">{t("configEditor.showWeather")}</Label>
          </div>
          {showWeather && (
            <p className="text-xs text-muted-foreground">
              {t("configEditor.weatherHint")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorInput id="cfg-titleColor" label={t("configEditor.titleColor")} value={(config.titleColor as string) ?? "#0f172a"} onChange={(value) => update("titleColor", value)} />
        <ColorInput id="cfg-bodyColor" label={t("configEditor.bodyColor")} value={(config.bodyColor as string) ?? "#1e293b"} onChange={(value) => update("bodyColor", value)} />
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">{t("configEditor.clinicDays")}</h4>
        <div className="grid gap-3">
          {weekdays.map((weekday) => {
            const day = days.find((candidate) => candidate.weekday === weekday.value) ?? defaultDays[weekday.value];

            return (
              <div key={weekday.value} className="grid gap-3 rounded-md border p-3 md:grid-cols-[88px_120px_1fr_1fr] md:items-center">
                <div className="font-medium">{t(weekday.key)}</div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!day.closed}
                    onCheckedChange={(checked) => updateDay(day.weekday, { closed: !checked })}
                  />
                  <span className={day.closed ? "text-sm text-muted-foreground" : "text-sm font-medium text-primary"}>
                    {day.closed ? t("configEditor.closed") : t("configEditor.open")}
                  </span>
                </div>
                <Input
                  value={day.morning}
                  disabled={day.closed}
                  placeholder={t("configEditor.morningHours")}
                  onChange={(e) => updateDay(day.weekday, { morning: e.target.value })}
                />
                <Input
                  value={day.afternoon}
                  disabled={day.closed}
                  placeholder={t("configEditor.afternoonHours")}
                  onChange={(e) => updateDay(day.weekday, { afternoon: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">{t("configEditor.clinicDateOverrides")}</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("configEditor.clinicDateOverridesDescription")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSpecialDate}>
            {t("configEditor.addDateOverride")}
          </Button>
        </div>
        {specialDates.length > 0 && (
          <div className="grid gap-3">
            {specialDates.map((item, index) => (
              <div
                key={`${item.date}-${index}`}
                className="grid gap-3 rounded-md border p-3 md:grid-cols-[150px_120px_1fr_1fr_auto] md:items-center"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`clinic-special-${index}`}>{t("configEditor.overrideDate")}</Label>
                  <Input
                    id={`clinic-special-${index}`}
                    type="date"
                    value={item.date}
                    onChange={(e) => updateSpecialDate(index, { date: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!item.closed}
                    onCheckedChange={(checked) => updateSpecialDate(index, { closed: !checked })}
                  />
                  <span className={item.closed ? "text-sm text-muted-foreground" : "text-sm font-medium text-primary"}>
                    {item.closed ? t("configEditor.closed") : t("configEditor.open")}
                  </span>
                </div>
                <Input
                  value={item.morning}
                  disabled={item.closed}
                  placeholder={t("configEditor.morningHours")}
                  onChange={(e) => updateSpecialDate(index, { morning: e.target.value })}
                />
                <Input
                  value={item.afternoon}
                  disabled={item.closed}
                  placeholder={t("configEditor.afternoonHours")}
                  onChange={(e) => updateSpecialDate(index, { afternoon: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeSpecialDate(index)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeDays(value: unknown): ClinicDayConfig[] {
  const rawDays = Array.isArray(value) ? value : [];
  return defaultDays.map((fallback) => {
    const raw = rawDays.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        (candidate as { weekday?: unknown }).weekday === fallback.weekday,
    ) as Partial<ClinicDayConfig> | undefined;

    return {
      ...fallback,
      ...raw,
      weekday: fallback.weekday,
      closed: raw?.closed ?? fallback.closed,
      morning: raw?.morning ?? fallback.morning,
      afternoon: raw?.afternoon ?? fallback.afternoon,
    };
  });
}

function normalizeSpecialDates(value: unknown): ClinicDateOverride[] {
  const rawItems = Array.isArray(value) ? value : [];
  return rawItems
    .filter((item): item is Partial<ClinicDateOverride> & { date: string } =>
      !!item && typeof item === "object" && typeof item.date === "string",
    )
    .map((item) => ({
      date: item.date.slice(0, 10),
      weekday: 0,
      closed: Boolean(item.closed),
      morning: typeof item.morning === "string" ? item.morning : "",
      afternoon: typeof item.afternoon === "string" ? item.afternoon : "",
    }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
}

function ColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-20 p-1"
      />
    </div>
  );
}
