"use client";

import { DateTimeClock } from "@/components/board/DateTimeClock";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps } from "@/types";

interface ScheduleEntryConfig {
  content: string;
  startTime: string;
  endTime: string;
  color: string;
}


interface ScheduleBoardConfig {
  title: string;
  body: string;
  displayStartTime: string;
  displayEndTime: string;
  fontFamily: string;
  showClock: boolean;
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  timeLabelColor: string;
  gridColor: string;
  cardTextColor: string;
  entries: ScheduleEntryConfig[];
}

interface PositionedScheduleEntry extends ScheduleEntryConfig {
  visibleStart: number;
  visibleEnd: number;
  lane: number;
  laneCount: number;
}

const MINUTES_PER_DAY = 24 * 60;
const DISPLAY_BUFFER_MINUTES = 30;
const EDGE_PADDING_PERCENT = 5;
const MAX_PARALLEL_LANES = 3;

export const scheduleBoardDefaultConfig: ScheduleBoardConfig = {
  title: "本日のスケジュール",
  body: "時間に沿って本日の予定を表示します。",
  displayStartTime: "08:00",
  displayEndTime: "18:00",
  fontFamily: "",
  showClock: false,
  backgroundColor: "#f8fafc",
  titleColor: "#0f172a",
  bodyColor: "#475569",
  timeLabelColor: "#334155",
  gridColor: "#cbd5e1",
  cardTextColor: "#0f172a",
  entries: [
    {
      content: "朝礼",
      startTime: "09:00",
      endTime: "09:30",
      color: "#dbeafe",
    },
    {
      content: "定例ミーティング",
      startTime: "10:00",
      endTime: "11:00",
      color: "#dcfce7",
    },
    {
      content: "来客対応",
      startTime: "13:30",
      endTime: "14:30",
      color: "#fef3c7",
    },
  ],
};

function normalizeTimeString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;

  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return Math.min(MINUTES_PER_DAY, Math.max(0, hour * 60 + minute));
}

function minutesToTime(minutes: number) {
  const normalized = Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minutes)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDisplayRange(startTime: string, endTime: string) {
  let start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);

  if (end <= start) {
    end = Math.min(MINUTES_PER_DAY, start + 60);
  }
  if (end - start < 60) {
    end = Math.min(MINUTES_PER_DAY, start + 60);
  }
  if (end - start < 60) {
    start = Math.max(0, end - 60);
  }

  return {
    start,
    end,
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
  };
}

function expandDisplayRange(start: number, end: number) {
  const safeStart = Math.max(0, start - DISPLAY_BUFFER_MINUTES);
  const safeEnd = Math.min(MINUTES_PER_DAY, end + DISPLAY_BUFFER_MINUTES);

  if (safeEnd - safeStart >= 60) {
    return { start: safeStart, end: safeEnd };
  }

  return normalizeDisplayRange(minutesToTime(safeStart), minutesToTime(safeEnd));
}

function toVerticalPercent(minutes: number, start: number, end: number) {
  const totalMinutes = Math.max(60, end - start);
  const ratio = (minutes - start) / totalMinutes;
  return EDGE_PADDING_PERCENT + ratio * (100 - EDGE_PADDING_PERCENT * 2);
}

function normalizeEntries(value: unknown): ScheduleEntryConfig[] {
  if (!Array.isArray(value)) return scheduleBoardDefaultConfig.entries;
  return value
    .slice(0, 20)
    .map((entry) => {
      const raw = entry && typeof entry === "object"
        ? (entry as Partial<ScheduleEntryConfig>)
        : {};
      return {
        content: typeof raw.content === "string" ? raw.content.slice(0, 120) : "",
        startTime: normalizeTimeString(raw.startTime, "09:00"),
        endTime: normalizeTimeString(raw.endTime, "10:00"),
        color: typeof raw.color === "string" && raw.color ? raw.color : "#dbeafe",
      };
    });
}

function parseConfig(raw: unknown): ScheduleBoardConfig {
  const config = (raw && typeof raw === "object"
    ? raw
    : {}) as Partial<ScheduleBoardConfig>;
  const range = normalizeDisplayRange(
    normalizeTimeString(config.displayStartTime, scheduleBoardDefaultConfig.displayStartTime),
    normalizeTimeString(config.displayEndTime, scheduleBoardDefaultConfig.displayEndTime),
  );

  return {
    ...scheduleBoardDefaultConfig,
    ...config,
    displayStartTime: range.startTime,
    displayEndTime: range.endTime,
    entries: normalizeEntries(config.entries),
  };
}

function buildTimeMarkers(start: number, end: number) {
  const markers = [start];
  let cursor = Math.ceil(start / 60) * 60;
  if (cursor === start) {
    cursor += 60;
  }
  while (cursor < end) {
    markers.push(cursor);
    cursor += 60;
  }
  if (markers[markers.length - 1] !== end) {
    markers.push(end);
  }
  return markers;
}

function layoutEntries(entries: ScheduleEntryConfig[], start: number, end: number) {
  const visibleEntries = entries
    .filter((entry) => entry.content.trim())
    .map((entry) => {
      const rawStart = timeToMinutes(entry.startTime);
      const rawEnd = timeToMinutes(entry.endTime);
      const normalizedEnd = rawEnd <= rawStart ? Math.min(MINUTES_PER_DAY, rawStart + 30) : rawEnd;
      return {
        ...entry,
        visibleStart: Math.max(start, rawStart),
        visibleEnd: Math.min(end, normalizedEnd),
      };
    })
    .filter((entry) => entry.visibleEnd > entry.visibleStart)
    .sort((left, right) => {
      if (left.visibleStart !== right.visibleStart) {
        return left.visibleStart - right.visibleStart;
      }
      return left.visibleEnd - right.visibleEnd;
    });

  const positioned: PositionedScheduleEntry[] = [];
  let cluster: Array<Omit<PositionedScheduleEntry, "lane" | "laneCount">> = [];
  let clusterEnd = -1;

  function flushCluster() {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const clusteredEntries: PositionedScheduleEntry[] = cluster.map((entry) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.visibleStart);
      if (lane === -1) {
        if (laneEnds.length < MAX_PARALLEL_LANES) {
          lane = laneEnds.length;
          laneEnds.push(entry.visibleEnd);
        } else {
          lane = laneEnds.reduce((bestIndex, laneEnd, laneIndex, source) =>
            laneEnd < source[bestIndex] ? laneIndex : bestIndex,
          0);
          laneEnds[lane] = Math.max(laneEnds[lane], entry.visibleEnd);
        }
      } else {
        laneEnds[lane] = entry.visibleEnd;
      }
      return {
        ...entry,
        lane,
        laneCount: 0,
      };
    });
    const laneCount = Math.max(1, Math.min(MAX_PARALLEL_LANES, laneEnds.length));
    positioned.push(
      ...clusteredEntries.map((entry) => ({
        ...entry,
        laneCount,
      })),
    );
    cluster = [];
    clusterEnd = -1;
  }

  for (const entry of visibleEntries) {
    if (cluster.length === 0 || entry.visibleStart < clusterEnd) {
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.visibleEnd);
      continue;
    }
    flushCluster();
    cluster.push(entry);
    clusterEnd = entry.visibleEnd;
  }
  flushCluster();

  return positioned;
}

export default function ScheduleBoard({ board }: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const range = normalizeDisplayRange(config.displayStartTime, config.displayEndTime);
  const displayRange = expandDisplayRange(range.start, range.end);
  const timeMarkers = buildTimeMarkers(displayRange.start, displayRange.end);
  const entries = layoutEntries(config.entries, displayRange.start, displayRange.end);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        backgroundColor: config.backgroundColor,
        color: config.cardTextColor,
        fontFamily: config.fontFamily || undefined,
        padding: "28px",
      }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}
      <header className="mb-6 flex shrink-0 items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1
            className="text-balance font-black tracking-tight"
            style={{ color: config.titleColor, fontSize: "44px", lineHeight: 1.08 }}
          >
            {config.title || board.name}
          </h1>
          {config.body && (
            <p
              className="mt-2 max-w-4xl leading-relaxed"
              style={{ color: config.bodyColor, fontSize: "20px" }}
            >
              {config.body}
            </p>
          )}
        </div>
        {config.showClock && (
          <div className="shrink-0">
            <DateTimeClock
              timeFontSize={28}
              color={config.titleColor}
              bgOpacity={0.08}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur">
        <div className="flex h-full min-h-0">
          <div className="relative w-24 shrink-0 border-r border-slate-200/80 bg-slate-50/70">
            {timeMarkers.map((minutes) => {
              const top = toVerticalPercent(minutes, displayRange.start, displayRange.end);
              return (
                <div
                  key={minutes}
                  className="absolute left-0 right-0"
                  style={{ top: `${top}%`, transform: "translateY(-50%)" }}
                >
                  <div
                    className="px-3 text-right font-semibold"
                    style={{ color: config.timeLabelColor, fontSize: "14px" }}
                  >
                    {minutesToTime(minutes)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {timeMarkers.map((minutes) => {
              const top = toVerticalPercent(minutes, displayRange.start, displayRange.end);
              return (
                <div
                  key={`line-${minutes}`}
                  className="absolute left-0 right-0 border-t"
                  style={{
                    top: `${top}%`,
                    borderColor: config.gridColor,
                  }}
                />
              );
            })}

            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-slate-500">
                予定が登録されていません
              </div>
            ) : (
              entries.map((entry, index) => {
                const top = toVerticalPercent(entry.visibleStart, displayRange.start, displayRange.end);
                const bottom = toVerticalPercent(entry.visibleEnd, displayRange.start, displayRange.end);
                const height = Math.max(4, bottom - top);
                const laneWidth = 100 / entry.laneCount;
                const inset = 8;
                return (
                  <article
                    key={`${entry.content}-${entry.startTime}-${entry.endTime}-${index}`}
                    className="absolute overflow-hidden rounded-xl border border-slate-200/70 shadow-sm"
                    style={{
                      top: `calc(${top}% + 4px)`,
                      height: `calc(${height}% - 8px)`,
                      left: `calc(${laneWidth * entry.lane}% + ${inset}px)`,
                      width: `calc(${laneWidth}% - ${inset * 2}px)`,
                      minHeight: "52px",
                      backgroundColor: entry.color,
                      color: config.cardTextColor,
                    }}
                  >
                    <div className="flex h-full items-start gap-3 px-4 py-3">
                      <div className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {entry.startTime} - {entry.endTime}
                      </div>
                      <div className="min-w-0 text-lg font-bold leading-snug">
                        {entry.content}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}