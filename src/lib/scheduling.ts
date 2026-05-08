// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

import type { MediaItem, Message } from "@/types";

export type ScheduleCapability = "none" | "time_weekday" | "full";
export type ScheduleMode = "always" | "scheduled" | "hidden";

export interface DisplaySchedule {
  mode: ScheduleMode;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
}

export type ScheduleMap = Record<string, DisplaySchedule>;

export interface SchedulableConfig {
  fallbackMediaId?: string;
  mediaSchedules?: ScheduleMap;
  messageSchedules?: ScheduleMap;
}

export const DEFAULT_DISPLAY_SCHEDULE: DisplaySchedule = {
  mode: "always",
  startTime: "00:00",
  endTime: "23:59",
  daysOfWeek: [],
  startDate: "",
  endDate: "",
};

const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function normalizeDisplaySchedule(raw: unknown): DisplaySchedule {
  const value = readObject(raw);
  const mode =
    value.mode === "scheduled" || value.mode === "hidden"
      ? value.mode
      : "always";
  const rawDays = Array.isArray(value.daysOfWeek) ? value.daysOfWeek : [];
  const daysOfWeek = Array.from(
    new Set(
      rawDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((a, b) => a - b);

  const startTime = typeof value.startTime === "string" && VALID_TIME.test(value.startTime)
    ? value.startTime
    : DEFAULT_DISPLAY_SCHEDULE.startTime;
  const endTime = typeof value.endTime === "string" && VALID_TIME.test(value.endTime)
    ? value.endTime
    : DEFAULT_DISPLAY_SCHEDULE.endTime;
  const startDate = typeof value.startDate === "string" && VALID_DATE.test(value.startDate)
    ? value.startDate
    : "";
  const endDate = typeof value.endDate === "string" && VALID_DATE.test(value.endDate)
    ? value.endDate
    : "";

  return {
    mode,
    startTime,
    endTime,
    daysOfWeek,
    startDate,
    endDate,
  };
}

export function getScheduleMap(raw: unknown): ScheduleMap {
  const value = readObject(raw);
  const entries = Object.entries(value).map(([id, schedule]) => [
    id,
    normalizeDisplaySchedule(schedule),
  ]);
  return Object.fromEntries(entries);
}

export function sanitizeScheduleForCapability(
  schedule: unknown,
  capability: ScheduleCapability,
): DisplaySchedule | null {
  if (capability === "none") return null;

  const normalized = normalizeDisplaySchedule(schedule);
  if (normalized.mode === "hidden") {
    return {
      ...DEFAULT_DISPLAY_SCHEDULE,
      mode: "hidden",
    };
  }

  if (normalized.mode !== "scheduled") {
    return { ...DEFAULT_DISPLAY_SCHEDULE };
  }

  return {
    ...normalized,
    startDate: capability === "full" ? normalized.startDate : "",
    endDate: capability === "full" ? normalized.endDate : "",
  };
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isInTimeRange(date: Date, startTime: string, endTime: string): boolean {
  const current = date.getHours() * 60 + date.getMinutes();
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);

  if (start <= end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

export function isScheduleActive(
  raw: unknown,
  capability: ScheduleCapability,
  now: Date,
): boolean {
  if (capability === "none") return true;

  const schedule = normalizeDisplaySchedule(raw);
  if (schedule.mode === "hidden") return false;
  if (schedule.mode !== "scheduled") return true;

  if (!isInTimeRange(now, schedule.startTime, schedule.endTime)) {
    return false;
  }

  if (schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(now.getDay())) {
    return false;
  }

  if (capability === "full") {
    const today = localDateKey(now);
    if (schedule.startDate && today < schedule.startDate) return false;
    if (schedule.endDate && today > schedule.endDate) return false;
  }

  return true;
}

export function filterActiveMediaItems(
  mediaItems: MediaItem[],
  config: unknown,
  capability: ScheduleCapability,
  now: Date,
): MediaItem[] {
  const cfg = readObject(config);
  const schedules = getScheduleMap(cfg.mediaSchedules);
  return mediaItems.filter((item) =>
    isScheduleActive(schedules[item.id], capability, now),
  );
}

export function filterActiveMessages(
  messages: Message[],
  config: unknown,
  capability: ScheduleCapability,
  now: Date,
): Message[] {
  const cfg = readObject(config);
  const schedules = getScheduleMap(cfg.messageSchedules);
  return messages.filter((message) =>
    isScheduleActive(schedules[message.id], capability, now),
  );
}

export function findFallbackImage(
  mediaItems: MediaItem[],
  config: unknown,
): MediaItem | null {
  const cfg = readObject(config);
  const fallbackMediaId =
    typeof cfg.fallbackMediaId === "string" ? cfg.fallbackMediaId : "";
  if (!fallbackMediaId) return null;

  return mediaItems.find(
    (item) => item.id === fallbackMediaId && item.type === "image",
  ) ?? null;
}

export function sanitizeSchedulingConfig(input: {
  config: Record<string, unknown>;
  capability: ScheduleCapability;
  mediaIds: Set<string>;
  imageIds: Set<string>;
  messageIds: Set<string>;
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input.config };

  if (input.capability === "none") {
    delete next.mediaSchedules;
    delete next.messageSchedules;
    delete next.fallbackMediaId;
    return next;
  }

  const mediaSchedules = getScheduleMap(next.mediaSchedules);
  const sanitizedMediaSchedules: ScheduleMap = {};
  for (const [id, schedule] of Object.entries(mediaSchedules)) {
    if (!input.mediaIds.has(id)) continue;
    const sanitized = sanitizeScheduleForCapability(schedule, input.capability);
    if (sanitized?.mode === "scheduled" || sanitized?.mode === "hidden") {
      sanitizedMediaSchedules[id] = sanitized;
    }
  }

  const messageSchedules = getScheduleMap(next.messageSchedules);
  const sanitizedMessageSchedules: ScheduleMap = {};
  for (const [id, schedule] of Object.entries(messageSchedules)) {
    if (!input.messageIds.has(id)) continue;
    const sanitized = sanitizeScheduleForCapability(schedule, input.capability);
    if (sanitized?.mode === "scheduled") sanitizedMessageSchedules[id] = sanitized;
  }

  if (Object.keys(sanitizedMediaSchedules).length > 0) {
    next.mediaSchedules = sanitizedMediaSchedules;
  } else {
    delete next.mediaSchedules;
  }

  if (Object.keys(sanitizedMessageSchedules).length > 0) {
    next.messageSchedules = sanitizedMessageSchedules;
  } else {
    delete next.messageSchedules;
  }

  const fallbackMediaId =
    typeof next.fallbackMediaId === "string" ? next.fallbackMediaId : "";
  if (!fallbackMediaId || !input.imageIds.has(fallbackMediaId)) {
    delete next.fallbackMediaId;
  }

  return next;
}
