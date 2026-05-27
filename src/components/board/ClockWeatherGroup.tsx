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

export type ClockWeatherPlacement =
  | "clock-top-right-weather-bottom-right"
  | "clock-top-left-weather-bottom-left"
  | "clock-top-right-weather-top-left"
  | "clock-top-left-weather-top-right"
  | "clock-bottom-right-weather-bottom-left"
  | "clock-bottom-left-weather-bottom-right"
  | "clock-bottom-right-weather-top-right"
  | "clock-bottom-left-weather-top-left";

interface ClockWeatherGroupProps {
  boardId: string;
  showClock: boolean;
  showWeather: boolean;
  placement?: ClockWeatherPlacement;
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

type PlacementAxis = "left-column" | "right-column" | "top-row" | "bottom-row";

type PlacementDefinition = {
  axis: PlacementAxis;
  order: "clock-first" | "weather-first";
};

const PLACEMENT_DEFINITIONS: Record<ClockWeatherPlacement, PlacementDefinition> = {
  "clock-top-right-weather-bottom-right": {
    axis: "right-column",
    order: "clock-first",
  },
  "clock-top-left-weather-bottom-left": {
    axis: "left-column",
    order: "clock-first",
  },
  "clock-top-right-weather-top-left": {
    axis: "top-row",
    order: "weather-first",
  },
  "clock-top-left-weather-top-right": {
    axis: "top-row",
    order: "clock-first",
  },
  "clock-bottom-right-weather-bottom-left": {
    axis: "bottom-row",
    order: "weather-first",
  },
  "clock-bottom-left-weather-bottom-right": {
    axis: "bottom-row",
    order: "clock-first",
  },
  "clock-bottom-right-weather-top-right": {
    axis: "right-column",
    order: "weather-first",
  },
  "clock-bottom-left-weather-top-left": {
    axis: "left-column",
    order: "weather-first",
  },
};

const LEGACY_LAYOUT_PLACEMENTS: Record<ClockWeatherLayout, ClockWeatherPlacement> = {
  "clock-top": "clock-top-right-weather-bottom-right",
  "weather-top": "clock-bottom-right-weather-top-right",
  "clock-left": "clock-top-left-weather-top-right",
  "weather-left": "clock-top-right-weather-top-left",
};

export function clockWeatherPlacementFromLegacyLayout(value: unknown): ClockWeatherPlacement {
  if (
    value === "clock-top"
    || value === "weather-top"
    || value === "clock-left"
    || value === "weather-left"
  ) {
    return LEGACY_LAYOUT_PLACEMENTS[value];
  }

  return LEGACY_LAYOUT_PLACEMENTS["clock-top"];
}

function placementClassName(axis: PlacementAxis) {
  switch (axis) {
    case "left-column":
      return "absolute bottom-4 left-4 top-4 flex-col items-stretch justify-between";
    case "top-row":
      return "absolute left-4 right-4 top-4 flex-row items-stretch justify-between";
    case "bottom-row":
      return "absolute bottom-4 left-4 right-4 flex-row items-stretch justify-between";
    case "right-column":
    default:
      return "absolute bottom-4 right-4 top-4 flex-col items-stretch justify-between";
  }
}

export function ClockWeatherGroup({
  boardId,
  showClock,
  showWeather,
  placement,
  layout = "clock-top",
  clock,
  weather,
}: ClockWeatherGroupProps) {
  if (!showClock && !showWeather) return null;

  const resolvedPlacement = placement ?? clockWeatherPlacementFromLegacyLayout(layout);
  const definition = PLACEMENT_DEFINITIONS[resolvedPlacement];
  const clockElement = showClock && (
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
  );
  const weatherElement = showWeather && (
    <WeatherDisplay
      boardId={boardId}
      color={weather?.color}
      bgOpacity={weather?.bgOpacity}
      fontSize={weather?.fontSize}
      fontFamily={weather?.fontFamily}
      className="self-stretch justify-center"
    />
  );
  const children = definition.order === "weather-first"
    ? [weatherElement, clockElement]
    : [clockElement, weatherElement];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className={`pointer-events-auto flex gap-2 ${placementClassName(definition.axis)}`}>
        {children.map((child, index) => child && (
          <div key={index} className="flex self-stretch">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
