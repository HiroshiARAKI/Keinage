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

export type ClockWeatherAnchor =
  | "bottom-right"
  | "top-right"
  | "top-left"
  | "bottom-left"
  | "right-split"
  | "left-split"
  | "top-split"
  | "bottom-split";

export type ClockWeatherArrangement =
  | "vertical-clock-top"
  | "vertical-weather-top"
  | "horizontal-clock-right"
  | "horizontal-weather-right";

export interface ClockWeatherState {
  anchor: ClockWeatherAnchor;
  arrangement: ClockWeatherArrangement;
}

interface ClockWeatherGroupProps {
  boardId: string;
  showClock: boolean;
  showWeather: boolean;
  anchor?: ClockWeatherAnchor;
  arrangement?: ClockWeatherArrangement;
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

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const DEFAULT_CLOCK_WEATHER_STATE: ClockWeatherState = {
  anchor: "right-split",
  arrangement: "vertical-clock-top",
};

const LEGACY_LAYOUT_STATES: Record<ClockWeatherLayout, ClockWeatherState> = {
  "clock-top": DEFAULT_CLOCK_WEATHER_STATE,
  "weather-top": {
    anchor: "right-split",
    arrangement: "vertical-weather-top",
  },
  "clock-left": {
    anchor: "top-split",
    arrangement: "horizontal-weather-right",
  },
  "weather-left": {
    anchor: "top-split",
    arrangement: "horizontal-clock-right",
  },
};

const LEGACY_PLACEMENT_STATES: Record<ClockWeatherPlacement, ClockWeatherState> = {
  "clock-top-right-weather-bottom-right": DEFAULT_CLOCK_WEATHER_STATE,
  "clock-top-left-weather-bottom-left": {
    anchor: "left-split",
    arrangement: "vertical-clock-top",
  },
  "clock-top-right-weather-top-left": {
    anchor: "top-split",
    arrangement: "horizontal-clock-right",
  },
  "clock-top-left-weather-top-right": {
    anchor: "top-split",
    arrangement: "horizontal-weather-right",
  },
  "clock-bottom-right-weather-bottom-left": {
    anchor: "bottom-split",
    arrangement: "horizontal-clock-right",
  },
  "clock-bottom-left-weather-bottom-right": {
    anchor: "bottom-split",
    arrangement: "horizontal-weather-right",
  },
  "clock-bottom-right-weather-top-right": {
    anchor: "right-split",
    arrangement: "vertical-weather-top",
  },
  "clock-bottom-left-weather-top-left": {
    anchor: "left-split",
    arrangement: "vertical-weather-top",
  },
};

export function isClockWeatherAnchor(value: unknown): value is ClockWeatherAnchor {
  return (
    value === "bottom-right"
    || value === "top-right"
    || value === "top-left"
    || value === "bottom-left"
    || value === "right-split"
    || value === "left-split"
    || value === "top-split"
    || value === "bottom-split"
  );
}

export function isClockWeatherArrangement(value: unknown): value is ClockWeatherArrangement {
  return (
    value === "vertical-clock-top"
    || value === "vertical-weather-top"
    || value === "horizontal-clock-right"
    || value === "horizontal-weather-right"
  );
}

export function isClockWeatherPlacement(value: unknown): value is ClockWeatherPlacement {
  return (
    value === "clock-top-right-weather-bottom-right"
    || value === "clock-top-left-weather-bottom-left"
    || value === "clock-top-right-weather-top-left"
    || value === "clock-top-left-weather-top-right"
    || value === "clock-bottom-right-weather-bottom-left"
    || value === "clock-bottom-left-weather-bottom-right"
    || value === "clock-bottom-right-weather-top-right"
    || value === "clock-bottom-left-weather-top-left"
  );
}

export function isArrangementAllowedForAnchor(
  anchor: ClockWeatherAnchor,
  arrangement: ClockWeatherArrangement,
) {
  if (anchor === "right-split" || anchor === "left-split") {
    return arrangement === "vertical-clock-top" || arrangement === "vertical-weather-top";
  }

  if (anchor === "top-split" || anchor === "bottom-split") {
    return arrangement === "horizontal-clock-right" || arrangement === "horizontal-weather-right";
  }

  return true;
}

export function arrangementsForAnchor(anchor: ClockWeatherAnchor): ClockWeatherArrangement[] {
  if (anchor === "right-split" || anchor === "left-split") {
    return ["vertical-clock-top", "vertical-weather-top"];
  }

  if (anchor === "top-split" || anchor === "bottom-split") {
    return ["horizontal-clock-right", "horizontal-weather-right"];
  }

  return [
    "vertical-clock-top",
    "vertical-weather-top",
    "horizontal-clock-right",
    "horizontal-weather-right",
  ];
}

export function defaultArrangementForAnchor(anchor: ClockWeatherAnchor): ClockWeatherArrangement {
  if (anchor === "top-split" || anchor === "bottom-split") {
    return "horizontal-weather-right";
  }

  return "vertical-clock-top";
}

export function normalizeClockWeatherState(input: {
  anchor?: unknown;
  arrangement?: unknown;
  placement?: unknown;
  layout?: unknown;
}): ClockWeatherState {
  if (isClockWeatherAnchor(input.anchor) && isClockWeatherArrangement(input.arrangement)) {
    return {
      anchor: input.anchor,
      arrangement: isArrangementAllowedForAnchor(input.anchor, input.arrangement)
        ? input.arrangement
        : defaultArrangementForAnchor(input.anchor),
    };
  }

  if (isClockWeatherPlacement(input.placement)) {
    return LEGACY_PLACEMENT_STATES[input.placement];
  }

  if (
    input.layout === "clock-top"
    || input.layout === "weather-top"
    || input.layout === "clock-left"
    || input.layout === "weather-left"
  ) {
    return LEGACY_LAYOUT_STATES[input.layout];
  }

  return DEFAULT_CLOCK_WEATHER_STATE;
}

export function clockWeatherPlacementFromLegacyLayout(value: unknown): ClockWeatherPlacement {
  const state = normalizeClockWeatherState({ layout: value });
  if (state.anchor === "left-split") {
    return state.arrangement === "vertical-weather-top"
      ? "clock-bottom-left-weather-top-left"
      : "clock-top-left-weather-bottom-left";
  }
  if (state.anchor === "top-split") {
    return state.arrangement === "horizontal-clock-right"
      ? "clock-top-right-weather-top-left"
      : "clock-top-left-weather-top-right";
  }
  if (state.anchor === "right-split") {
    return state.arrangement === "vertical-weather-top"
      ? "clock-bottom-right-weather-top-right"
      : "clock-top-right-weather-bottom-right";
  }
  return "clock-top-right-weather-bottom-right";
}

function isClusterAnchor(anchor: ClockWeatherAnchor) {
  return (
    anchor === "bottom-right"
    || anchor === "top-right"
    || anchor === "top-left"
    || anchor === "bottom-left"
  );
}

function isVerticalArrangement(arrangement: ClockWeatherArrangement) {
  return arrangement === "vertical-clock-top" || arrangement === "vertical-weather-top";
}

export function clockCornerForClockWeatherState(state: ClockWeatherState): Corner {
  switch (state.anchor) {
    case "top-left":
      return "top-left";
    case "top-right":
      return "top-right";
    case "bottom-left":
      return "bottom-left";
    case "bottom-right":
      return "bottom-right";
    case "left-split":
      return state.arrangement === "vertical-weather-top" ? "bottom-left" : "top-left";
    case "right-split":
      return state.arrangement === "vertical-weather-top" ? "bottom-right" : "top-right";
    case "top-split":
      return state.arrangement === "horizontal-clock-right" ? "top-right" : "top-left";
    case "bottom-split":
      return state.arrangement === "horizontal-clock-right" ? "bottom-right" : "bottom-left";
  }
}

function weatherCornerForState(state: ClockWeatherState): Corner {
  switch (state.anchor) {
    case "top-left":
      return "top-left";
    case "top-right":
      return "top-right";
    case "bottom-left":
      return "bottom-left";
    case "bottom-right":
      return "bottom-right";
    case "left-split":
      return state.arrangement === "vertical-weather-top" ? "top-left" : "bottom-left";
    case "right-split":
      return state.arrangement === "vertical-weather-top" ? "top-right" : "bottom-right";
    case "top-split":
      return state.arrangement === "horizontal-clock-right" ? "top-left" : "top-right";
    case "bottom-split":
      return state.arrangement === "horizontal-clock-right" ? "bottom-left" : "bottom-right";
  }
}

function cornerClassName(corner: Corner) {
  switch (corner) {
    case "top-left":
      return "left-4 top-4";
    case "top-right":
      return "right-4 top-4";
    case "bottom-left":
      return "bottom-4 left-4";
    case "bottom-right":
      return "bottom-4 right-4";
  }
}

function groupedClassName(state: ClockWeatherState) {
  switch (state.anchor) {
    case "top-left":
      return "left-4 top-4";
    case "top-right":
      return "right-4 top-4";
    case "bottom-left":
      return "bottom-4 left-4";
    case "bottom-right":
      return "bottom-4 right-4";
    default:
      return "";
  }
}

function splitClassName(anchor: ClockWeatherAnchor) {
  switch (anchor) {
    case "left-split":
      return "bottom-4 left-4 top-4 flex-col justify-between";
    case "right-split":
      return "bottom-4 right-4 top-4 flex-col justify-between";
    case "top-split":
      return "left-4 right-4 top-4 flex-row justify-between";
    case "bottom-split":
      return "bottom-4 left-4 right-4 flex-row justify-between";
    default:
      return "";
  }
}

function pairClassName(state: ClockWeatherState) {
  if (state.anchor.endsWith("-split")) {
    return splitClassName(state.anchor);
  }

  const direction =
    state.arrangement === "horizontal-clock-right"
    || state.arrangement === "horizontal-weather-right"
      ? "flex-row"
      : "flex-col";

  return `${groupedClassName(state)} ${direction} w-max`;
}

function orderedChildren(
  state: ClockWeatherState,
  clockElement: React.ReactNode,
  weatherElement: React.ReactNode,
) {
  if (state.arrangement === "vertical-weather-top") {
    return [weatherElement, clockElement];
  }
  if (state.arrangement === "horizontal-clock-right") {
    return [weatherElement, clockElement];
  }
  return [clockElement, weatherElement];
}

export function ClockWeatherGroup({
  boardId,
  showClock,
  showWeather,
  anchor,
  arrangement,
  placement,
  layout = "clock-top",
  clock,
  weather,
}: ClockWeatherGroupProps) {
  if (!showClock && !showWeather) return null;

  const state = normalizeClockWeatherState({ anchor, arrangement, placement, layout });
  const shouldStretchVerticalCluster =
    isClusterAnchor(state.anchor) && isVerticalArrangement(state.arrangement);
  const itemClassName = shouldStretchVerticalCluster
    ? "self-stretch justify-center w-full"
    : "self-stretch justify-center";
  const clockElement = showClock && (
    <DateTimeClock
      is24Hour={clock?.is24Hour}
      timeFontSize={clock?.timeFontSize}
      dateFontSize={clock?.dateFontSize}
      color={clock?.color}
      bgOpacity={clock?.bgOpacity}
      layout={clock?.layout}
      fontFamily={clock?.fontFamily}
      className={itemClassName}
    />
  );
  const weatherElement = showWeather && (
    <WeatherDisplay
      boardId={boardId}
      color={weather?.color}
      bgOpacity={weather?.bgOpacity}
      fontSize={weather?.fontSize}
      fontFamily={weather?.fontFamily}
      className={itemClassName}
    />
  );

  if (!showClock || !showWeather) {
    const visibleElement = clockElement || weatherElement;
    const corner = showClock ? clockCornerForClockWeatherState(state) : weatherCornerForState(state);

    return (
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className={`pointer-events-auto absolute flex ${cornerClassName(corner)}`}>
          {visibleElement}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className={`pointer-events-auto absolute flex items-stretch gap-2 ${pairClassName(state)}`}>
        {orderedChildren(state, clockElement, weatherElement).map((child, index) => child && (
          <div
            key={index}
            className={shouldStretchVerticalCluster ? "flex w-full self-stretch" : "flex self-stretch"}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
