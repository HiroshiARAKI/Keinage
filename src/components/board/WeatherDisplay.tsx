// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UmbrellaIcon,
  WeatherConditionIcon,
} from "@/components/board/WeatherIcons";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { WEATHER_REFRESH_BROWSER_EVENT } from "@/lib/weather/events";
import type { WeatherCondition, WeatherForecast } from "@/lib/weather/types";

interface WeatherDisplayProps {
  boardId?: string;
  color?: string;
  bgOpacity?: number;
  /** Base font size in design points (1pt = 1px at the 1080px design height). */
  fontSize?: number;
  /** Custom font family */
  fontFamily?: string;
  className?: string;
}

function temperatureValue(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}°C`;
}

function probabilityValue(value: number | null) {
  return value === null ? "--" : `${value}%`;
}

const CONDITION_LABEL_KEYS: Record<
  WeatherCondition,
  | "weather.condition.clear"
  | "weather.condition.partlyCloudy"
  | "weather.condition.cloudy"
  | "weather.condition.rain"
  | "weather.condition.snow"
  | "weather.condition.thunder"
  | "weather.condition.fog"
  | "weather.condition.unknown"
> = {
  clear: "weather.condition.clear",
  "partly-cloudy": "weather.condition.partlyCloudy",
  cloudy: "weather.condition.cloudy",
  rain: "weather.condition.rain",
  snow: "weather.condition.snow",
  thunder: "weather.condition.thunder",
  fog: "weather.condition.fog",
  unknown: "weather.condition.unknown",
};

export function WeatherDisplay({
  boardId,
  color = "#ffffff",
  bgOpacity = 0.56,
  fontSize = 18,
  fontFamily,
  className,
}: WeatherDisplayProps) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const { t } = useLocale();

  const fetchWeather = useCallback(async () => {
    try {
      const search = boardId ? `?boardId=${encodeURIComponent(boardId)}` : "";
      const response = await fetch(`/api/weather${search}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      setWeather(await response.json() as WeatherForecast);
    } catch {
      // Keep the previous forecast when a refresh fails.
    }
  }, [boardId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void fetchWeather();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchWeather();
    }, 30 * 60 * 1000);
    const refreshWeather = () => {
      void fetchWeather();
    };
    window.addEventListener(WEATHER_REFRESH_BROWSER_EVENT, refreshWeather);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener(WEATHER_REFRESH_BROWSER_EVENT, refreshWeather);
    };
  }, [fetchWeather]);

  if (!weather) return null;

  const cardWidth = Math.max(660, Math.round(fontSize * 40));
  const titleSize = Math.max(13, Math.round(fontSize * 0.78));
  const labelSize = Math.max(12, Math.round(fontSize * 0.72));
  const highSize = Math.max(32, Math.round(fontSize * 2.35));
  const lowSize = Math.max(25, Math.round(fontSize * 1.75));
  const iconSize = Math.max(72, Math.round(fontSize * 5.2));

  return (
    <section
      className={`min-w-0 overflow-hidden rounded-2xl border border-white/15 shadow-lg backdrop-blur-sm ${className ?? ""}`}
      style={{
        width: cardWidth,
        maxWidth: "100%",
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        color,
        fontFamily: fontFamily || undefined,
      }}
      aria-label={t("weather.cardLabel")}
    >
      <header
        className="border-b border-white/20 px-6 py-3 font-semibold tracking-wide"
        style={{ fontSize: Math.max(15, Math.round(fontSize * 0.95)) }}
      >
        {weather.location.name}
      </header>

      <div className="grid grid-cols-[1.05fr_.82fr_1.8fr] divide-x divide-white/15">
        <div className="flex min-w-0 flex-col items-center justify-center px-5 py-4 text-center">
          <span className="font-medium uppercase tracking-[0.16em] opacity-65" style={{ fontSize: titleSize }}>
            {t("weather.today")}
          </span>
          <WeatherConditionIcon
            condition={weather.condition.code}
            className="my-1 shrink-0"
            style={{ width: iconSize, height: iconSize }}
          />
          <span className="-mt-[1px] font-semibold leading-tight" style={{ fontSize }}>
            {t(CONDITION_LABEL_KEYS[weather.condition.code])}
          </span>
        </div>

        <div className="flex min-w-0 flex-col justify-center px-5 py-4 text-center">
          <div className="pb-3">
            <div className="font-medium uppercase tracking-[0.12em] opacity-60" style={{ fontSize: labelSize }}>
              {t("weather.highLabel")}
            </div>
            <div className="font-semibold leading-none" style={{ fontSize: highSize }}>
              {temperatureValue(weather.temperature.maxCelsius)}
            </div>
          </div>
          <div className="border-t border-white/20 pt-3">
            <div className="font-medium uppercase tracking-[0.12em] opacity-60" style={{ fontSize: labelSize }}>
              {t("weather.lowLabel")}
            </div>
            <div className="font-medium leading-none" style={{ fontSize: lowSize }}>
              {temperatureValue(weather.temperature.minCelsius)}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center px-5 py-4">
          <div className="mb-3 flex items-center justify-center gap-2 font-medium uppercase tracking-[0.12em] opacity-75" style={{ fontSize: titleSize }}>
            <span>{t("weather.rainChance")}</span>
            <UmbrellaIcon className="size-[1.35em]" />
          </div>
          <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-white/20">
            {weather.precipitation.map((period) => (
              <div
                key={`${period.startHour}-${period.endHour}`}
                className="border-r border-white/15 px-1 py-2 text-center last:border-r-0"
              >
                <div className="whitespace-nowrap opacity-55" style={{ fontSize: labelSize }}>
                  {t("weather.period", {
                    start: period.startHour,
                    end: period.endHour,
                  })}
                </div>
                <div className="mt-1 font-semibold" style={{ fontSize: Math.max(17, Math.round(fontSize * 1.08)) }}>
                  {probabilityValue(period.probability)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-5 text-center opacity-45" style={{ fontSize: labelSize }}>
            {[0, 6, 12, 18, 24].map((hour) => (
              <span key={hour}>
                {t("weather.timelineHour", { hour })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
