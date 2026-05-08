// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";

export type ClockLayout = "standard" | "compact" | "large-time" | "date-top";

interface DateTimeClockProps {
  /** 24-hour format (default: true) */
  is24Hour?: boolean;
  /** Font size in px for the time display */
  timeFontSize?: number;
  /** Text color */
  color?: string;
  /** Background opacity 0-1 */
  bgOpacity?: number;
  /** Clock layout variant */
  layout?: ClockLayout;
  /** Custom font family */
  fontFamily?: string;
}

export function DateTimeClock({
  is24Hour = true,
  timeFontSize = 48,
  color = "#ffffff",
  bgOpacity = 0.5,
  layout = "standard",
  fontFamily,
}: DateTimeClockProps) {
  const [now, setNow] = useState<Date | null>(null);
  const { locale, formatDate } = useLocale();

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  if (!now) return null;

  const parts = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !is24Hour,
  }).formatToParts(now);
  const hoursStr = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minutes = parts.find((part) => part.type === "minute")?.value ?? "00";
  const seconds = parts.find((part) => part.type === "second")?.value ?? "00";
  const period = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !is24Hour,
  }).format(now);
  const dateStr = formatDate(now, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const dateFontSize = Math.max(14, Math.round(timeFontSize * 0.35));

  const fontStyle = fontFamily || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  if (layout === "compact") {
    return (
      <div
        className="inline-flex items-center gap-4 rounded-lg px-5 py-2"
        style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`, color, fontFamily: fontStyle }}
      >
        <span
          className="font-bold tabular-nums tracking-wider"
          style={{ fontSize: timeFontSize }}
        >
          {timeStr}
        </span>
        <span
          className="font-medium opacity-90"
          style={{ fontSize: dateFontSize }}
        >
          {dateStr}
        </span>
      </div>
    );
  }

  if (layout === "large-time") {
    return (
      <div
        className="inline-flex flex-col items-center rounded-lg px-8 py-4"
        style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`, color, fontFamily: fontStyle }}
      >
        <span
          className="font-bold tabular-nums tracking-wider"
          style={{ fontSize: timeFontSize * 1.3 }}
        >
          {hoursStr}:{minutes}
        </span>
        <span
          className="tabular-nums opacity-70"
          style={{ fontSize: Math.round(timeFontSize * 0.5) }}
        >
          :{seconds}{period ? ` ${period}` : ""}
        </span>
        <span
          className="mt-1 font-medium opacity-80"
          style={{ fontSize: dateFontSize }}
        >
          {dateStr}
        </span>
      </div>
    );
  }

  if (layout === "date-top") {
    return (
      <div
        className="inline-flex flex-col items-center rounded-lg px-6 py-3"
        style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`, color, fontFamily: fontStyle }}
      >
        <span
          className="font-medium opacity-90"
          style={{ fontSize: dateFontSize }}
        >
          {dateStr}
        </span>
        <span
          className="mt-1 font-bold tabular-nums tracking-wider"
          style={{ fontSize: timeFontSize }}
        >
          {timeStr}
        </span>
      </div>
    );
  }

  // "standard" layout (default)
  return (
    <div
      className="inline-flex flex-col items-center rounded-lg px-6 py-3"
      style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`, color, fontFamily: fontStyle }}
    >
      <span
        className="font-bold tabular-nums tracking-wider"
        style={{ fontSize: timeFontSize }}
      >
        {timeStr}
      </span>
      <span
        className="mt-1 font-medium opacity-90"
        style={{ fontSize: dateFontSize }}
      >
        {dateStr}
      </span>
    </div>
  );
}
