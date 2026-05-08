// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { MediaSlider } from "@/components/board/MediaSlider";
import { TickerText } from "@/components/board/TickerText";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import { DateTimeClock } from "@/components/board/DateTimeClock";
import { WeatherDisplay } from "@/components/board/WeatherDisplay";
import { ScheduledMediaFallback } from "@/components/board/ScheduledMediaFallback";
import { useScheduleNow } from "@/hooks/useScheduleNow";
import {
  filterActiveMediaItems,
  filterActiveMessages,
  findFallbackImage,
} from "@/lib/scheduling";
import type { BoardTemplateProps } from "@/types";

/** Default config for the Simple Board template */
export const simpleBoardDefaultConfig = {
  slideInterval: 5,
  tickerSpeed: 60,
  backgroundColor: "#000000",
  textColor: "#ffffff",
  tickerBgColor: "#1a1a2e",
  tickerFontFamily: "",
  tickerFontSize: 18,
  tickerPosition: "bottom" as "top" | "bottom",
  showClock: false,
  showWeather: false,
  objectFit: "contain" as "contain" | "cover",
  fallbackMediaId: "",
  mediaSchedules: {},
  messageSchedules: {},
};

type SimpleBoardConfig = typeof simpleBoardDefaultConfig;

function parseConfig(raw: unknown): SimpleBoardConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<SimpleBoardConfig>;
  return { ...simpleBoardDefaultConfig, ...cfg };
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
      className="flex h-screen w-screen flex-col"
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
            interval={config.slideInterval}
            objectFit={config.objectFit}
          />
        ) : (
          <ScheduledMediaFallback
            item={fallbackImage}
            objectFit={config.objectFit}
          />
        )}

        {/* Clock & Weather overlay */}
        {(config.showClock || config.showWeather) && (
          <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
            {config.showClock && (
              <DateTimeClock
                timeFontSize={36}
                color="#ffffff"
                bgOpacity={0.5}
                layout="compact"
                fontFamily={config.tickerFontFamily || undefined}
              />
            )}
            {config.showWeather && (
              <WeatherDisplay
                boardId={board.id}
                color="#ffffff"
                bgOpacity={0.5}
                fontFamily={config.tickerFontFamily || undefined}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom ticker */}
      {config.tickerPosition === "bottom" && tickerElement}
    </div>
  );
}
