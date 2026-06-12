// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { MediaSlider } from "@/components/board/MediaSlider";
import {
  ClockWeatherGroup,
  normalizeClockWeatherState,
  type ClockWeatherAnchor,
  type ClockWeatherArrangement,
} from "@/components/board/ClockWeatherGroup";
import { DateTimeClock, type ClockLayout } from "@/components/board/DateTimeClock";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import { ScheduledMediaFallback } from "@/components/board/ScheduledMediaFallback";
import { useScheduleNow } from "@/hooks/useScheduleNow";
import {
  filterActiveMediaItems,
  findFallbackImage,
} from "@/lib/scheduling";
import {
  normalizeSlideshowTransition,
  type SlideshowTransition,
} from "@/lib/slideshow-transition";
import type { BoardTemplateProps } from "@/types";

type ClockPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/** Default config for the Photo-Clock Board template */
export const photoClockDefaultConfig = {
  clockPosition: "bottom-right" as ClockPosition,
  clockFontSize: 48,
  clockDateFontSize: 18,
  clockColor: "#ffffff",
  clockBgOpacity: 0.5,
  clockLayout: "standard" as ClockLayout,
  clockWeatherAnchor: "right-split" as ClockWeatherAnchor,
  clockWeatherArrangement: "vertical-clock-top" as ClockWeatherArrangement,
  is24Hour: true,
  showWeather: false,
  weatherFontSize: 18,
  objectFit: "contain" as "contain" | "cover",
  mediaTransition: "fade-black" as SlideshowTransition,
  randomPlayback: false,
  fontFamily: "",
  fallbackMediaId: "",
  mediaSchedules: {},
};

type PhotoClockConfig = typeof photoClockDefaultConfig;

function parseConfig(raw: unknown): PhotoClockConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<PhotoClockConfig>;

  // Migrate old Tailwind font classes to the equivalent design-point value.
  const merged = { ...photoClockDefaultConfig, ...cfg };
  if (typeof merged.clockFontSize === "string") {
    const sizeMap: Record<string, number> = {
      "text-3xl": 30,
      "text-5xl": 48,
      "text-7xl": 72,
      "text-9xl": 128,
    };
    merged.clockFontSize =
      sizeMap[merged.clockFontSize as string] ?? 48;
  }
  const clockWeatherState = normalizeClockWeatherState({
    anchor: cfg.clockWeatherAnchor,
    arrangement: cfg.clockWeatherArrangement,
    placement: (cfg as { clockWeatherPlacement?: unknown }).clockWeatherPlacement,
    layout: (cfg as { clockWeatherLayout?: unknown }).clockWeatherLayout,
  });
  merged.clockWeatherAnchor = clockWeatherState.anchor;
  merged.clockWeatherArrangement = clockWeatherState.arrangement;
  merged.mediaTransition = normalizeSlideshowTransition(cfg.mediaTransition);
  return merged;
}

const positionClasses: Record<ClockPosition, string> = {
  "top-left": "top-6 left-6",
  "top-right": "top-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "bottom-right": "bottom-6 right-6",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

export default function PhotoClockBoard({
  board,
  mediaItems,
  boardPlan,
}: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const now = useScheduleNow();
  const scheduling = boardPlan?.scheduling ?? "full";

  const sorted = [...mediaItems].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const activeMedia = filterActiveMediaItems(
    sorted,
    config,
    scheduling,
    now,
  );
  const fallbackImage = findFallbackImage(sorted, config);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {config.fontFamily && (
        <GoogleFontLoader fonts={[config.fontFamily]} />
      )}
      {/* Full-screen slideshow */}
      {activeMedia.length > 0 ? (
        <MediaSlider
          mediaItems={activeMedia}
          objectFit={config.objectFit}
          playbackOrder={config.randomPlayback ? "random" : "sequential"}
          transition={config.mediaTransition}
          synchronizationKey={board.id}
        />
      ) : (
        <ScheduledMediaFallback
          item={fallbackImage}
          objectFit={config.objectFit}
        />
      )}

      {/* Clock + Weather overlay */}
      {config.showWeather ? (
        <ClockWeatherGroup
          boardId={board.id}
          showClock
          showWeather={config.showWeather}
          anchor={config.clockWeatherAnchor}
          arrangement={config.clockWeatherArrangement}
          clock={{
            is24Hour: config.is24Hour,
            timeFontSize: config.clockFontSize,
            dateFontSize: config.clockDateFontSize,
            color: config.clockColor,
            bgOpacity: config.clockBgOpacity,
            layout: config.clockLayout,
            fontFamily: config.fontFamily || undefined,
          }}
          weather={{
            color: config.clockColor,
            bgOpacity: config.clockBgOpacity,
            fontSize: config.weatherFontSize,
            fontFamily: config.fontFamily || undefined,
          }}
        />
      ) : (
        <div
          className={`absolute z-10 flex flex-col gap-2 ${positionClasses[config.clockPosition] ?? positionClasses["bottom-right"]}`}
        >
          <DateTimeClock
            is24Hour={config.is24Hour}
            timeFontSize={config.clockFontSize}
            dateFontSize={config.clockDateFontSize}
            color={config.clockColor}
            bgOpacity={config.clockBgOpacity}
            layout={config.clockLayout}
            fontFamily={config.fontFamily || undefined}
          />
        </div>
      )}
    </div>
  );
}
