// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { MediaSlider } from "@/components/board/MediaSlider";
import { DateTimeClock } from "@/components/board/DateTimeClock";
import { WeatherDisplay } from "@/components/board/WeatherDisplay";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import { ScheduledMediaFallback } from "@/components/board/ScheduledMediaFallback";
import { useScheduleNow } from "@/hooks/useScheduleNow";
import {
  filterActiveMediaItems,
  findFallbackImage,
} from "@/lib/scheduling";
import type { ClockLayout } from "@/components/board/DateTimeClock";
import type { BoardTemplateProps } from "@/types";

type ClockPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/** Default config for the Photo-Clock Board template */
export const photoClockDefaultConfig = {
  slideInterval: 8,
  clockPosition: "bottom-right" as ClockPosition,
  clockFontSize: 48,
  clockColor: "#ffffff",
  clockBgOpacity: 0.5,
  clockLayout: "standard" as ClockLayout,
  is24Hour: true,
  showWeather: false,
  objectFit: "contain" as "contain" | "cover",
  fontFamily: "",
  fallbackMediaId: "",
  mediaSchedules: {},
};

type PhotoClockConfig = typeof photoClockDefaultConfig;

function parseConfig(raw: unknown): PhotoClockConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<PhotoClockConfig>;

  // Migrate old Tailwind class fontSize to pixel value
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
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {config.fontFamily && (
        <GoogleFontLoader fonts={[config.fontFamily]} />
      )}
      {/* Full-screen slideshow */}
      {activeMedia.length > 0 ? (
        <MediaSlider
          mediaItems={activeMedia}
          interval={config.slideInterval}
          objectFit={config.objectFit}
        />
      ) : (
        <ScheduledMediaFallback
          item={fallbackImage}
          objectFit={config.objectFit}
        />
      )}

      {/* Clock + Weather overlay */}
      <div
        className={`absolute z-10 flex flex-col gap-2 ${positionClasses[config.clockPosition] ?? positionClasses["bottom-right"]}`}
      >
        <DateTimeClock
          is24Hour={config.is24Hour}
          timeFontSize={config.clockFontSize}
          color={config.clockColor}
          bgOpacity={config.clockBgOpacity}
          layout={config.clockLayout}
          fontFamily={config.fontFamily || undefined}
        />
        {config.showWeather && (
          <WeatherDisplay
            boardId={board.id}
            color={config.clockColor}
            bgOpacity={config.clockBgOpacity}
            fontFamily={config.fontFamily || undefined}
          />
        )}
      </div>
    </div>
  );
}
