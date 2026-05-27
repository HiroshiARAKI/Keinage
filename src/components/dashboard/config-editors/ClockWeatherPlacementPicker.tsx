// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import {
  clockWeatherPlacementFromLegacyLayout,
  type ClockWeatherPlacement,
} from "@/components/board/ClockWeatherGroup";
import type { MessageKey } from "@/lib/i18n";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type PlacementOption = {
  value: ClockWeatherPlacement;
  clock: Corner;
  weather: Corner;
  labelKey: MessageKey;
};

export const CLOCK_WEATHER_PLACEMENT_OPTIONS: PlacementOption[] = [
  {
    value: "clock-top-right-weather-bottom-right",
    clock: "top-right",
    weather: "bottom-right",
    labelKey: "configEditor.clockWeatherPlacement1",
  },
  {
    value: "clock-top-left-weather-bottom-left",
    clock: "top-left",
    weather: "bottom-left",
    labelKey: "configEditor.clockWeatherPlacement2",
  },
  {
    value: "clock-top-right-weather-top-left",
    clock: "top-right",
    weather: "top-left",
    labelKey: "configEditor.clockWeatherPlacement3",
  },
  {
    value: "clock-top-left-weather-top-right",
    clock: "top-left",
    weather: "top-right",
    labelKey: "configEditor.clockWeatherPlacement4",
  },
  {
    value: "clock-bottom-right-weather-bottom-left",
    clock: "bottom-right",
    weather: "bottom-left",
    labelKey: "configEditor.clockWeatherPlacement5",
  },
  {
    value: "clock-bottom-left-weather-bottom-right",
    clock: "bottom-left",
    weather: "bottom-right",
    labelKey: "configEditor.clockWeatherPlacement6",
  },
  {
    value: "clock-bottom-right-weather-top-right",
    clock: "bottom-right",
    weather: "top-right",
    labelKey: "configEditor.clockWeatherPlacement7",
  },
  {
    value: "clock-bottom-left-weather-top-left",
    clock: "bottom-left",
    weather: "top-left",
    labelKey: "configEditor.clockWeatherPlacement8",
  },
];

export function legacyPlacementFromLayout(value: unknown): ClockWeatherPlacement {
  return clockWeatherPlacementFromLegacyLayout(value);
}

export function isClockWeatherPlacement(value: unknown): value is ClockWeatherPlacement {
  return (
    typeof value === "string"
    && CLOCK_WEATHER_PLACEMENT_OPTIONS.some((option) => option.value === value)
  );
}

const cornerClassName: Record<Corner, string> = {
  "top-left": "left-2 top-2",
  "top-right": "right-2 top-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

function WeatherGlyph({ corner }: { corner: Corner }) {
  return (
    <div className={`absolute ${cornerClassName[corner]}`} aria-hidden>
      <svg
        viewBox="0 0 32 20"
        className="h-5 w-8 text-slate-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10" cy="8" r="4" />
        <path d="M10 1.5v2M10 12.5v2M3.5 8h2M14.5 8h2M5.4 3.4l1.4 1.4M13.2 11.2l1.4 1.4M14.6 3.4l-1.4 1.4M6.8 11.2l-1.4 1.4" />
        <path d="M13 17h11.5a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.5 2.1A3 3 0 0 0 13 17Z" />
      </svg>
    </div>
  );
}

function ClockGlyph({ corner }: { corner: Corner }) {
  return (
    <div
      className={`absolute ${cornerClassName[corner]} rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-slate-700`}
    >
      12:34
    </div>
  );
}

function PlacementIcon({ option }: { option: PlacementOption }) {
  return (
    <div className="relative aspect-[16/9] w-full rounded border border-slate-300 bg-white">
      <ClockGlyph corner={option.clock} />
      <WeatherGlyph corner={option.weather} />
    </div>
  );
}

export function ClockWeatherPlacementPicker({
  value,
  onChange,
}: {
  value: ClockWeatherPlacement;
  onChange: (value: ClockWeatherPlacement) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {CLOCK_WEATHER_PLACEMENT_OPTIONS.map((option, index) => {
        const selected = option.value === value;
        const label = t(option.labelKey);

        return (
          <button
            key={option.value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border bg-background p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-primary/50",
            )}
          >
            <PlacementIcon option={option} />
            <div className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
              {index + 1}
            </div>
          </button>
        );
      })}
    </div>
  );
}
