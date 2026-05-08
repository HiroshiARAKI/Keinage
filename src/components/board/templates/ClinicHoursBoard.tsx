// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps } from "@/types";

interface ClinicDayConfig {
  closed: boolean;
  morning: string;
  afternoon: string;
}

interface ClinicHoursConfig {
  title: string;
  body: string;
  daysToShow: number;
  weekStartsOn: "sun" | "mon";
  titleColor: string;
  bodyColor: string;
  fontFamily: string;
  days: ClinicDayConfig[];
}

export const clinicHoursDefaultConfig: ClinicHoursConfig = {
  title: "診療時間案内",
  body: "受付時間は状況により変更になる場合があります。",
  daysToShow: 14,
  weekStartsOn: "sun",
  titleColor: "#0f766e",
  bodyColor: "#1f2937",
  fontFamily: "",
  days: [
    { closed: true, morning: "", afternoon: "" },
    { closed: false, morning: "09:00~12:00", afternoon: "14:00~18:00" },
    { closed: false, morning: "09:00~12:00", afternoon: "14:00~18:00" },
    { closed: false, morning: "09:00~12:00", afternoon: "14:00~18:00" },
    { closed: false, morning: "09:00~12:00", afternoon: "14:00~18:00" },
    { closed: false, morning: "09:00~12:00", afternoon: "14:00~18:00" },
    { closed: false, morning: "09:00~12:00", afternoon: "" },
  ],
};

function parseConfig(raw: unknown): ClinicHoursConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<ClinicHoursConfig>;
  const days = Array.from({ length: 7 }, (_, index) => ({
    ...clinicHoursDefaultConfig.days[index],
    ...(Array.isArray(cfg.days) ? cfg.days[index] : {}),
  }));
  return {
    ...clinicHoursDefaultConfig,
    ...cfg,
    daysToShow: Math.min(31, Math.max(7, Number(cfg.daysToShow) || 14)),
    days,
  };
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

export default function ClinicHoursBoard({ board }: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const today = new Date();
  const dates = Array.from({ length: config.daysToShow }, (_, index) => addDays(today, index));
  const firstDayIndex =
    config.weekStartsOn === "mon" ? (dates[0].getDay() + 6) % 7 : dates[0].getDay();
  const calendarCells: Array<Date | null> = [
    ...Array.from({ length: firstDayIndex }, () => null),
    ...dates,
  ];
  const weekRows = Math.ceil(calendarCells.length / 7);
  const layout = getCalendarLayout(weekRows);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#f7fbfb]"
      style={{
        fontFamily: config.fontFamily || undefined,
        padding: layout.screenPadding,
      }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}
      <header style={{ marginBottom: layout.headerMargin }}>
        <h1
          className="font-bold tracking-normal"
          style={{ color: config.titleColor, fontSize: layout.titleFontSize, lineHeight: 1.1 }}
        >
          {config.title || board.name}
        </h1>
        {config.body && (
          <p
            className="mt-1 max-w-5xl leading-relaxed"
            style={{ color: config.bodyColor, fontSize: layout.bodyFontSize }}
          >
            {config.body}
          </p>
        )}
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gap: layout.gridGap,
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))`,
        }}
      >
        {calendarCells.map((date, index) => {
          if (!date) {
            return <div key={`blank-${index}`} aria-hidden="true" />;
          }

          const day = config.days[date.getDay()] ?? clinicHoursDefaultConfig.days[date.getDay()];
          const isSunday = date.getDay() === 0;
          const isSaturday = date.getDay() === 6;
          return (
            <section
              key={date.toISOString()}
              className={`flex min-h-0 flex-col overflow-hidden rounded-md border bg-white shadow-sm ${
                day.closed ? "border-rose-200 bg-rose-50" : "border-teal-100"
              }`}
              style={{ padding: layout.cardPadding }}
            >
              <div
                className="flex items-baseline justify-between gap-2"
                style={{ marginBottom: layout.cardHeaderMargin }}
              >
                <span
                  className="font-bold text-slate-900"
                  style={{ fontSize: layout.dateFontSize, lineHeight: 1 }}
                >
                  {formatDay(date)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    isSunday
                      ? "bg-rose-100 text-rose-700"
                      : isSaturday
                        ? "bg-sky-100 text-sky-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                  style={{ fontSize: layout.weekdayFontSize, lineHeight: 1.15 }}
                >
                  {weekdayLabels[date.getDay()]}
                </span>
              </div>
              {day.closed ? (
                <div
                  className="flex min-h-0 flex-1 items-center justify-center rounded bg-rose-100 font-bold text-rose-700"
                  style={{ fontSize: layout.closedFontSize }}
                >
                  休診
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-rows-2 text-slate-900" style={{ gap: layout.slotGap }}>
                  <TimeSlot
                    label="午前"
                    value={day.morning || "—"}
                    tone="morning"
                    labelFontSize={layout.slotLabelFontSize}
                    valueFontSize={layout.slotValueFontSize}
                    padding={layout.slotPadding}
                  />
                  <TimeSlot
                    label="午後"
                    value={day.afternoon || "—"}
                    tone="afternoon"
                    labelFontSize={layout.slotLabelFontSize}
                    valueFontSize={layout.slotValueFontSize}
                    padding={layout.slotPadding}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimeSlot({
  label,
  value,
  tone,
  labelFontSize,
  valueFontSize,
  padding,
}: {
  label: string;
  value: string;
  tone: "morning" | "afternoon";
  labelFontSize: number;
  valueFontSize: number;
  padding: string;
}) {
  const toneClass =
    tone === "morning"
      ? "bg-teal-50 text-teal-700"
      : "bg-cyan-50 text-cyan-700";

  return (
    <div className={`min-h-0 overflow-hidden rounded ${toneClass}`} style={{ padding }}>
      <div className="font-semibold" style={{ fontSize: labelFontSize, lineHeight: 1.1 }}>
        {label}
      </div>
      <div
        className="mt-0.5 truncate font-bold text-slate-900"
        style={{ fontSize: valueFontSize, lineHeight: 1.12 }}
      >
        {value}
      </div>
    </div>
  );
}

function getCalendarLayout(weekRows: number) {
  if (weekRows >= 6) {
    return {
      screenPadding: "20px",
      headerMargin: "12px",
      titleFontSize: 34,
      bodyFontSize: 17,
      gridGap: "6px",
      cardPadding: "8px",
      cardHeaderMargin: "6px",
      dateFontSize: 18,
      weekdayFontSize: 11,
      closedFontSize: 20,
      slotGap: "5px",
      slotPadding: "6px",
      slotLabelFontSize: 11,
      slotValueFontSize: 16,
    };
  }

  if (weekRows >= 5) {
    return {
      screenPadding: "24px",
      headerMargin: "14px",
      titleFontSize: 38,
      bodyFontSize: 18,
      gridGap: "8px",
      cardPadding: "10px",
      cardHeaderMargin: "8px",
      dateFontSize: 20,
      weekdayFontSize: 12,
      closedFontSize: 24,
      slotGap: "6px",
      slotPadding: "8px",
      slotLabelFontSize: 12,
      slotValueFontSize: 18,
    };
  }

  return {
    screenPadding: "40px",
    headerMargin: "24px",
    titleFontSize: 48,
    bodyFontSize: 24,
    gridGap: "12px",
    cardPadding: "16px",
    cardHeaderMargin: "12px",
    dateFontSize: 24,
    weekdayFontSize: 14,
    closedFontSize: 30,
    slotGap: "12px",
    slotPadding: "12px",
    slotLabelFontSize: 14,
    slotValueFontSize: 24,
  };
}
