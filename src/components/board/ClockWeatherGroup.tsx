// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { DateTimeClock, type ClockLayout } from "@/components/board/DateTimeClock";
import { WeatherDisplay } from "@/components/board/WeatherDisplay";

export type ClockWeatherLayout =
  | "clock-top"
  | "weather-top"
  | "clock-left"
  | "weather-left";

interface ClockWeatherGroupProps {
  boardId: string;
  showClock: boolean;
  showWeather: boolean;
  layout?: ClockWeatherLayout;
  clock?: {
    is24Hour?: boolean;
    timeFontSize?: number;
    dateFontSize?: number;
    color?: string;
    bgOpacity?: number;
    layout?: ClockLayout;
    fontFamily?: string;
  };
  weather?: {
    color?: string;
    bgOpacity?: number;
    fontSize?: number;
    fontFamily?: string;
  };
}

function groupClassName(layout: ClockWeatherLayout) {
  switch (layout) {
    case "weather-top":
      return "flex-col-reverse items-stretch";
    case "clock-left":
      return "flex-row items-stretch";
    case "weather-left":
      return "flex-row-reverse items-stretch";
    case "clock-top":
    default:
      return "flex-col items-stretch";
  }
}

export function ClockWeatherGroup({
  boardId,
  showClock,
  showWeather,
  layout = "clock-top",
  clock,
  weather,
}: ClockWeatherGroupProps) {
  if (!showClock && !showWeather) return null;

  return (
    <div className={`flex w-max gap-2 ${groupClassName(layout)}`}>
      {showClock && (
        <DateTimeClock
          is24Hour={clock?.is24Hour}
          timeFontSize={clock?.timeFontSize}
          dateFontSize={clock?.dateFontSize}
          color={clock?.color}
          bgOpacity={clock?.bgOpacity}
          layout={clock?.layout}
          fontFamily={clock?.fontFamily}
          className="self-stretch justify-center"
        />
      )}
      {showWeather && (
        <WeatherDisplay
          boardId={boardId}
          color={weather?.color}
          bgOpacity={weather?.bgOpacity}
          fontSize={weather?.fontSize}
          fontFamily={weather?.fontFamily}
          className="self-stretch justify-center"
        />
      )}
    </div>
  );
}
