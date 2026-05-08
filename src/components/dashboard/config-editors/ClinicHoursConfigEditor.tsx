// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FontSelect, numberValue, useLoadAllGoogleFonts } from "./shared";

interface ClinicDayConfig {
  weekday: number;
  closed: boolean;
  morning: string;
  afternoon: string;
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
  const daysToShow = numberValue(config.daysToShow, 14);
  const fontFamily = (config.fontFamily as string) ?? "";
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
