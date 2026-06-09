// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { MediaSlider } from "@/components/board/MediaSlider";
import { TickerText } from "@/components/board/TickerText";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import {
  ClockWeatherGroup,
  normalizeClockWeatherState,
  type ClockWeatherAnchor,
  type ClockWeatherArrangement,
} from "@/components/board/ClockWeatherGroup";
import { ScheduledMediaFallback } from "@/components/board/ScheduledMediaFallback";
import { useScheduleNow } from "@/hooks/useScheduleNow";
import {
  filterActiveMediaItems,
  filterActiveMessages,
  findFallbackImage,
} from "@/lib/scheduling";
import {
  normalizeSlideshowTransition,
  type SlideshowTransition,
} from "@/lib/slideshow-transition";
import type { BoardTemplateProps } from "@/types";

/** Default config for the Simple Board template */
export const simpleBoardDefaultConfig = {
  tickerSpeed: 60,
  backgroundColor: "#000000",
  textColor: "#ffffff",
  tickerBgColor: "#1a1a2e",
  tickerFontFamily: "",
  tickerFontSize: 18,
  tickerPosition: "bottom" as "top" | "bottom",
  showClock: false,
  showWeather: false,
  clockFontSize: 36,
  clockDateFontSize: 14,
  weatherFontSize: 18,
  clockWeatherAnchor: "right-split" as ClockWeatherAnchor,
  clockWeatherArrangement: "vertical-clock-top" as ClockWeatherArrangement,
  objectFit: "contain" as "contain" | "cover",
  mediaTransition: "fade-black" as SlideshowTransition,
  fallbackMediaId: "",
  mediaSchedules: {},
  messageSchedules: {},
};

type SimpleBoardConfig = typeof simpleBoardDefaultConfig;

function parseConfig(raw: unknown): SimpleBoardConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<SimpleBoardConfig>;
  const merged = { ...simpleBoardDefaultConfig, ...cfg };
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

export default function SimpleBoard({
  board,
  mediaItems,
  messages,
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

  const tickerMessages = filterActiveMessages(
    messages,
    config,
    scheduling,
    now,
  ).map((m) => m.content);

  // Dynamic ticker height based on font size + padding
  const tickerHeight = config.tickerFontSize + 24;

  const tickerElement = tickerMessages.length > 0 && (
    <div
      className="flex items-center border-white/10 px-4 font-medium shrink-0"
      style={{
        color: config.textColor,
        backgroundColor: config.tickerBgColor,
        height: tickerHeight,
        fontSize: config.tickerFontSize,
        borderTop: config.tickerPosition === "bottom" ? "1px solid rgba(255,255,255,0.1)" : undefined,
        borderBottom: config.tickerPosition === "top" ? "1px solid rgba(255,255,255,0.1)" : undefined,
      }}
    >
      <TickerText
        messages={tickerMessages}
        speed={config.tickerSpeed}
        fontFamily={config.tickerFontFamily || undefined}
      />
    </div>
  );

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {config.tickerFontFamily && (
        <GoogleFontLoader fonts={[config.tickerFontFamily]} />
      )}

      {/* Top ticker */}
      {config.tickerPosition === "top" && tickerElement}

      {/* Main area — slideshow */}
      <div className="relative flex-1 min-h-0">
        {activeMedia.length > 0 ? (
          <MediaSlider
            mediaItems={activeMedia}
            objectFit={config.objectFit}
            transition={config.mediaTransition}
          />
        ) : (
          <ScheduledMediaFallback
            item={fallbackImage}
            objectFit={config.objectFit}
          />
        )}

        {/* Clock & Weather overlay */}
        {(config.showClock || config.showWeather) && (
          <ClockWeatherGroup
            boardId={board.id}
            showClock={config.showClock}
            showWeather={config.showWeather}
            anchor={config.clockWeatherAnchor}
            arrangement={config.clockWeatherArrangement}
            clock={{
              timeFontSize: config.clockFontSize,
              dateFontSize: config.clockDateFontSize,
              color: "#ffffff",
              bgOpacity: 0.5,
              layout: "compact",
              fontFamily: config.tickerFontFamily || undefined,
            }}
            weather={{
              color: "#ffffff",
              bgOpacity: 0.5,
              fontSize: config.weatherFontSize,
              fontFamily: config.tickerFontFamily || undefined,
            }}
          />
        )}
      </div>

      {/* Bottom ticker */}
      {config.tickerPosition === "bottom" && tickerElement}
    </div>
  );
}
