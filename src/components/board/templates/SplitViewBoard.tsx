"use client";

import { DateTimeClock } from "@/components/board/DateTimeClock";
import { MediaSlider } from "@/components/board/MediaSlider";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createSplitViewDefaultConfig } from "@/lib/template-default-configs";
import type { BoardTemplateProps, MediaItem } from "@/types";

type SplitPaneType = "text" | "image" | "video";
type SplitDirection = "horizontal" | "vertical";

interface SplitPaneConfig {
  type: SplitPaneType;
  title: string;
  body: string;
  mediaPath: string;
  backgroundColor: string;
  textColor: string;
}

interface SplitViewConfig {
  splitDirection: SplitDirection;
  dividerColor: string;
  fontFamily: string;
  showClock: boolean;
  panes: SplitPaneConfig[];
}

export const splitViewDefaultConfig: SplitViewConfig = createSplitViewDefaultConfig();

function normalizePaneType(value: unknown): SplitPaneType {
  if (value === "image" || value === "video") return value;
  return "text";
}

function normalizeSplitDirection(value: unknown): SplitDirection {
  return value === "vertical" ? "vertical" : "horizontal";
}

function normalizePanes(value: unknown, defaultPanes: SplitPaneConfig[]): SplitPaneConfig[] {
  const rawPanes = Array.isArray(value) ? value : defaultPanes;
  const panes = rawPanes.slice(0, 2).map((pane, index) => {
    const raw = pane && typeof pane === "object"
      ? (pane as Partial<SplitPaneConfig>)
      : {};
    const fallback = defaultPanes[index] ?? defaultPanes[0];
    return {
      type: normalizePaneType(raw.type ?? fallback.type),
      title: typeof raw.title === "string" ? raw.title.slice(0, 80) : fallback.title,
      body: typeof raw.body === "string" ? raw.body.slice(0, 400) : fallback.body,
      mediaPath: typeof raw.mediaPath === "string" ? raw.mediaPath : "",
      backgroundColor:
        typeof raw.backgroundColor === "string" && raw.backgroundColor
          ? raw.backgroundColor
          : fallback.backgroundColor,
      textColor:
        typeof raw.textColor === "string" && raw.textColor
          ? raw.textColor
          : fallback.textColor,
    };
  });

  while (panes.length < 2) {
    panes.push(defaultPanes[panes.length]);
  }

  return panes;
}

function parseConfig(raw: unknown, defaultConfig: SplitViewConfig): SplitViewConfig {
  const config = (raw && typeof raw === "object"
    ? raw
    : {}) as Partial<SplitViewConfig>;

  return {
    ...defaultConfig,
    ...config,
    splitDirection: normalizeSplitDirection(config.splitDirection),
    panes: normalizePanes(config.panes, defaultConfig.panes),
  };
}

function findPaneMedia(
  pane: SplitPaneConfig,
  mediaItems: MediaItem[],
) {
  if (!pane.mediaPath) return null;
  return mediaItems.find(
    (item) => item.filePath === pane.mediaPath && item.type === pane.type,
  ) ?? null;
}

export default function SplitViewBoard({ board, mediaItems }: BoardTemplateProps) {
  const { t } = useLocale();
  const defaultConfig = createSplitViewDefaultConfig(t);
  const config = parseConfig(board.config, defaultConfig);
  const isVertical = config.splitDirection === "vertical";
  const clockColor = config.panes[0]?.textColor || "#ffffff";

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden ${
        isVertical ? "flex-col" : "flex-row"
      }`}
      style={{
        backgroundColor: config.dividerColor,
        fontFamily: config.fontFamily || undefined,
        gap: "2px",
      }}
    >
      {config.showClock && (
        <div className="pointer-events-none absolute right-6 top-6 z-20">
          <DateTimeClock
            timeFontSize={28}
            color={clockColor}
            bgOpacity={0.2}
            layout="compact"
            fontFamily={config.fontFamily || undefined}
          />
        </div>
      )}
      {config.panes.map((pane, index) => {
        const paneMedia = findPaneMedia(pane, mediaItems);

        return (
          <section
            key={index}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
            style={{ backgroundColor: pane.backgroundColor, color: pane.textColor }}
          >
            {pane.type === "text" ? (
              <TextPane pane={pane} />
            ) : paneMedia ? (
              <MediaSlider mediaItems={[paneMedia]} objectFit="cover" />
            ) : (
              <EmptyMediaPane pane={pane} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function TextPane({ pane }: { pane: SplitPaneConfig }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-center px-10 py-12 md:px-16"
      style={{ backgroundColor: pane.backgroundColor, color: pane.textColor }}
    >
      {pane.title && (
        <h2 className="text-balance text-5xl font-black leading-tight tracking-tight md:text-6xl">
          {pane.title}
        </h2>
      )}
      {pane.body && (
        <p className="mt-5 max-w-3xl text-xl leading-relaxed md:text-2xl">
          {pane.body}
        </p>
      )}
    </div>
  );
}

function EmptyMediaPane({ pane }: { pane: SplitPaneConfig }) {
  const { t } = useLocale();
  const label = pane.type === "video" ? t("board.split.emptyVideo") : t("board.split.emptyImage");

  return (
    <div
      className="flex h-full w-full items-center justify-center px-8 text-center"
      style={{ backgroundColor: pane.backgroundColor, color: pane.textColor }}
    >
      <div>
        <p className="text-2xl font-bold">{label}</p>
        <p className="mt-3 text-base opacity-80">
          {t("board.split.emptyHint")}
        </p>
      </div>
    </div>
  );
}