// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import {
  arrangementsForAnchor,
  defaultArrangementForAnchor,
  isArrangementAllowedForAnchor,
  type ClockWeatherAnchor,
  type ClockWeatherArrangement,
  type ClockWeatherState,
} from "@/components/board/ClockWeatherGroup";
import type { MessageKey } from "@/lib/i18n";
import type { ReactNode } from "react";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type AnchorOption = {
  value: ClockWeatherAnchor;
  labelKey: MessageKey;
};

type ArrangementOption = {
  value: ClockWeatherArrangement;
  labelKey: MessageKey;
};

const ANCHOR_OPTIONS: AnchorOption[] = [
  { value: "bottom-right", labelKey: "configEditor.clockWeatherAnchorBottomRight" },
  { value: "top-right", labelKey: "configEditor.clockWeatherAnchorTopRight" },
  { value: "top-left", labelKey: "configEditor.clockWeatherAnchorTopLeft" },
  { value: "bottom-left", labelKey: "configEditor.clockWeatherAnchorBottomLeft" },
  { value: "right-split", labelKey: "configEditor.clockWeatherAnchorRightSplit" },
  { value: "left-split", labelKey: "configEditor.clockWeatherAnchorLeftSplit" },
  { value: "top-split", labelKey: "configEditor.clockWeatherAnchorTopSplit" },
  { value: "bottom-split", labelKey: "configEditor.clockWeatherAnchorBottomSplit" },
];

const ARRANGEMENT_OPTIONS: ArrangementOption[] = [
  { value: "vertical-clock-top", labelKey: "configEditor.clockWeatherArrangementVerticalClockTop" },
  { value: "vertical-weather-top", labelKey: "configEditor.clockWeatherArrangementVerticalWeatherTop" },
  { value: "horizontal-clock-right", labelKey: "configEditor.clockWeatherArrangementHorizontalClockRight" },
  { value: "horizontal-weather-right", labelKey: "configEditor.clockWeatherArrangementHorizontalWeatherRight" },
];

const cornerClassName: Record<Corner, string> = {
  "top-left": "left-2 top-2",
  "top-right": "right-2 top-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

function isClusterAnchor(anchor: ClockWeatherAnchor) {
  return (
    anchor === "bottom-right"
    || anchor === "top-right"
    || anchor === "top-left"
    || anchor === "bottom-left"
  );
}

function clusterClassName(anchor: ClockWeatherAnchor) {
  switch (anchor) {
    case "top-left":
      return "left-2 top-2 items-start";
    case "top-right":
      return "right-2 top-2 items-end";
    case "bottom-left":
      return "bottom-2 left-2 items-start";
    case "bottom-right":
      return "bottom-2 right-2 items-end";
    default:
      return "";
  }
}

function clockCornerForState(state: ClockWeatherState): Corner {
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

function orderedGlyphs(state: ClockWeatherState) {
  const clock = <ClockGlyph key="clock" />;
  const weather = <WeatherGlyph key="weather" />;

  if (state.arrangement === "vertical-weather-top" || state.arrangement === "horizontal-clock-right") {
    return [weather, clock];
  }

  return [clock, weather];
}

function WeatherGlyph({ corner }: { corner?: Corner }) {
  return (
    <div className={cn(corner && `absolute ${cornerClassName[corner]}`)} aria-hidden>
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

function ClockGlyph({ corner }: { corner?: Corner }) {
  return (
    <div
      className={cn(
        "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-slate-700",
        corner && `absolute ${cornerClassName[corner]}`,
      )}
    >
      12:34
    </div>
  );
}

function PlacementIcon({ state }: { state: ClockWeatherState }) {
  const horizontal =
    state.arrangement === "horizontal-clock-right"
    || state.arrangement === "horizontal-weather-right";

  return (
    <div className="relative aspect-[16/9] w-full rounded border border-slate-300 bg-white">
      {isClusterAnchor(state.anchor) ? (
        <div
          className={cn(
            "absolute flex gap-1",
            clusterClassName(state.anchor),
            horizontal ? "flex-row items-center" : "flex-col",
          )}
        >
          {orderedGlyphs(state)}
        </div>
      ) : (
        <>
          <ClockGlyph corner={clockCornerForState(state)} />
          <WeatherGlyph corner={weatherCornerForState(state)} />
        </>
      )}
    </div>
  );
}

function PickerButton({
  selected,
  label,
  children,
  onClick,
}: {
  selected: boolean;
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-md border bg-background p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/50",
      )}
    >
      {children}
      <div className="mt-1 truncate text-center text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
    </button>
  );
}

export function ClockWeatherPlacementPicker({
  value,
  onChange,
}: {
  value: ClockWeatherState;
  onChange: (value: ClockWeatherState) => void;
}) {
  const { t } = useLocale();
  const arrangementOptions = ARRANGEMENT_OPTIONS.filter((option) => (
    arrangementsForAnchor(value.anchor).includes(option.value)
  ));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">
          {t("configEditor.clockWeatherAnchor")}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ANCHOR_OPTIONS.map((option) => {
            const label = t(option.labelKey);
            const nextArrangement = isArrangementAllowedForAnchor(option.value, value.arrangement)
              ? value.arrangement
              : defaultArrangementForAnchor(option.value);
            const previewState = {
              anchor: option.value,
              arrangement: defaultArrangementForAnchor(option.value),
            };

            return (
              <PickerButton
                key={option.value}
                selected={option.value === value.anchor}
                label={label}
                onClick={() => onChange({ anchor: option.value, arrangement: nextArrangement })}
              >
                <PlacementIcon state={previewState} />
              </PickerButton>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">
          {t("configEditor.clockWeatherArrangement")}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {arrangementOptions.map((option) => {
            const label = t(option.labelKey);
            const state = { anchor: value.anchor, arrangement: option.value };

            return (
              <PickerButton
                key={option.value}
                selected={option.value === value.arrangement}
                label={label}
                onClick={() => onChange(state)}
              >
                <PlacementIcon state={state} />
              </PickerButton>
            );
          })}
        </div>
      </div>
    </div>
  );
}
