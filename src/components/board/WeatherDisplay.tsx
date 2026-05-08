// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useLocale } from "@/components/i18n/LocaleProvider";

interface WeatherData {
  location: { city: string; prefecture: string };
  telop: string;
  image: { url: string; title: string; width: number; height: number };
  chanceOfRain: {
    T00_06: string;
    T06_12: string;
    T12_18: string;
    T18_24: string;
  };
  temperature: {
    min: { celsius: string | null };
    max: { celsius: string | null };
  };
}

interface WeatherDisplayProps {
  boardId?: string;
  color?: string;
  bgOpacity?: number;
  /** Custom font family */
  fontFamily?: string;
}

export function WeatherDisplay({
  boardId,
  color = "#ffffff",
  bgOpacity = 0.5,
  fontFamily,
}: WeatherDisplayProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const { t, translateWeatherTelop } = useLocale();

  const fetchWeather = useCallback(async () => {
    try {
      const search = boardId
        ? `?boardId=${encodeURIComponent(boardId)}`
        : "";
      const res = await fetch(`/api/weather${search}`);
      if (!res.ok) return;
      const data = await res.json();
      setWeather(data);
    } catch {
      // silently ignore
    }
  }, [boardId]);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchWeather();
    }, 0);
    // Refresh every 30 minutes
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchWeather]);

  if (!weather) return null;

  const rain = weather.chanceOfRain;
  /** "--%" → "0%" */
  const r = (v: string) => (v === "--%" ? "0%" : v);

  return (
    <div
      className="flex items-center gap-4 rounded-xl px-5 py-3"
      style={{
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        color,
        fontFamily: fontFamily || undefined,
      }}
    >
      {/* Weather icon */}
      {weather.image?.url && (
        <Image
          src={weather.image.url}
          alt={weather.image.title || weather.telop}
          width={90}
          height={72}
          className="shrink-0"
          unoptimized
        />
      )}

      <div className="flex flex-col gap-1 text-lg leading-snug">
        {/* Location header */}
        <span className="font-bold text-xl">
          {t("weather.current", {
            city: weather.location?.city ?? "",
            telop: translateWeatherTelop(weather.telop),
          })}
        </span>

        {/* Temperature */}
        {(weather.temperature.max.celsius ||
          weather.temperature.min.celsius) && (
          <span className="opacity-80">
            {weather.temperature.max.celsius &&
              t("weather.high", { value: weather.temperature.max.celsius })}
            {weather.temperature.max.celsius &&
              weather.temperature.min.celsius &&
              " / "}
            {weather.temperature.min.celsius &&
              t("weather.low", { value: weather.temperature.min.celsius })}
          </span>
        )}

        {/* Chance of rain — all time slots */}
        <div className="flex items-center gap-1 opacity-80 text-base">
          <span>{t("weather.rainChance")}:</span>
          <span>{t("weather.slot00_06", { value: r(rain.T00_06) })}</span>
          <span className="opacity-40">|</span>
          <span>{t("weather.slot06_12", { value: r(rain.T06_12) })}</span>
          <span className="opacity-40">|</span>
          <span>{t("weather.slot12_18", { value: r(rain.T12_18) })}</span>
          <span className="opacity-40">|</span>
          <span>{t("weather.slot18_24", { value: r(rain.T18_24) })}</span>
        </div>
      </div>
    </div>
  );
}
