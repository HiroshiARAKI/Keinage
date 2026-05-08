// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Clock3, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/components/i18n/LocaleProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_DISPLAY_SCHEDULE,
  getScheduleMap,
  normalizeDisplaySchedule,
  type DisplaySchedule,
  type ScheduleCapability,
  type ScheduleMap,
} from "@/lib/scheduling";
import type { MediaItem, Message } from "@/types";

interface BoardSchedulePanelProps {
  templateId: string;
  config: Record<string, unknown>;
  mediaItems: MediaItem[];
  messages: Message[];
  scheduling: ScheduleCapability;
  onChange: (config: Record<string, unknown>) => void;
}

const WEEKDAYS = [
  { value: 0, labelKey: "schedule.weekday.sun" },
  { value: 1, labelKey: "schedule.weekday.mon" },
  { value: 2, labelKey: "schedule.weekday.tue" },
  { value: 3, labelKey: "schedule.weekday.wed" },
  { value: 4, labelKey: "schedule.weekday.thu" },
  { value: 5, labelKey: "schedule.weekday.fri" },
  { value: 6, labelKey: "schedule.weekday.sat" },
] as const;

export function planLabelKey(capability: ScheduleCapability) {
  switch (capability) {
    case "none":
      return "schedule.plan.none";
    case "time_weekday":
      return "schedule.plan.timeWeekday";
    case "full":
      return "schedule.plan.full";
  }
}

function scheduleModeLabelKey(schedule: DisplaySchedule) {
  if (schedule.mode === "hidden") return "schedule.mode.hidden";
  return schedule.mode === "scheduled" ? "schedule.mode.scheduled" : "schedule.mode.always";
}

export function sanitizeScheduleMap(map: ScheduleMap) {
  return Object.fromEntries(
    Object.entries(map).filter(([, schedule]) =>
      schedule.mode === "scheduled" || schedule.mode === "hidden",
    ),
  );
}

export function itemName(item: MediaItem) {
  return item.filePath.split("/").pop() ?? item.filePath;
}

export function numberedImageLabel(item: MediaItem, imageItems: MediaItem[]) {
  const index = imageItems.findIndex((image) => image.id === item.id);
  const number = index >= 0 ? index + 1 : 0;
  return { number, name: itemName(item) };
}

interface ScheduleControlsProps {
  idPrefix: string;
  schedule: DisplaySchedule;
  capability: ScheduleCapability;
  onChange: (schedule: DisplaySchedule) => void;
  allowHidden?: boolean;
}

export function ScheduleControls({
  idPrefix,
  schedule,
  capability,
  onChange,
  allowHidden = false,
}: ScheduleControlsProps) {
  const { t } = useLocale();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const disabled = capability === "none";
  const isScheduled = schedule.mode === "scheduled";

  function update(patch: Partial<DisplaySchedule>) {
    onChange({ ...schedule, ...patch });
  }

  function toggleDay(day: number) {
    const days = schedule.daysOfWeek.includes(day)
      ? schedule.daysOfWeek.filter((value) => value !== day)
      : [...schedule.daysOfWeek, day].sort((a, b) => a - b);
    update({ daysOfWeek: days });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={schedule.mode}
          disabled={disabled}
          onValueChange={(value) => {
            const mode =
              value === "hidden" && allowHidden
                ? "hidden"
                : value === "scheduled"
                  ? "scheduled"
                  : "always";
            if (mode === "scheduled") {
              setDetailsOpen(true);
            }
            update({
              ...(mode === "scheduled" || mode === "hidden"
                ? DEFAULT_DISPLAY_SCHEDULE
                : schedule),
              mode,
            });
          }}
        >
          <SelectTrigger id={`${idPrefix}-mode`} className="w-40">
            <SelectValue>{t(scheduleModeLabelKey(schedule))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">{t("schedule.mode.always")}</SelectItem>
            <SelectItem value="scheduled">{t("schedule.mode.scheduled")}</SelectItem>
            {allowHidden && (
              <SelectItem value="hidden">{t("schedule.mode.hiddenOption")}</SelectItem>
            )}
          </SelectContent>
        </Select>
        {schedule.mode === "scheduled" && (
          <Badge variant="secondary" className="gap-1">
            <Clock3 className="size-3" />
            {t("schedule.badge.scheduled")}
          </Badge>
        )}
        {schedule.mode === "hidden" && (
          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
            {t("schedule.badge.hidden")}
          </Badge>
        )}
        {isScheduled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen((value) => !value)}
            className="ml-auto"
          >
            {detailsOpen ? (
              <ChevronUp data-icon="inline-start" />
            ) : (
              <ChevronDown data-icon="inline-start" />
            )}
            {detailsOpen ? t("schedule.details.collapse") : t("schedule.details.expand")}
          </Button>
        )}
      </div>

      {isScheduled && detailsOpen && (
        <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-start-time`}>{t("schedule.startTime")}</Label>
            <Input
              id={`${idPrefix}-start-time`}
              type="time"
              value={schedule.startTime}
              disabled={disabled}
              onChange={(event) => update({ startTime: event.target.value || "00:00" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-end-time`}>{t("schedule.endTime")}</Label>
            <Input
              id={`${idPrefix}-end-time`}
              type="time"
              value={schedule.endTime}
              disabled={disabled}
              onChange={(event) => update({ endTime: event.target.value || "23:59" })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("schedule.weekdays")}</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const everyDay = schedule.daysOfWeek.length === 0;
                const checked = everyDay || schedule.daysOfWeek.includes(day.value);
                return (
                  <label
                    key={day.value}
                    className={`inline-flex min-w-14 cursor-pointer flex-col items-center justify-center rounded-md border px-2 py-1 text-xs transition-colors ${
                      checked
                        ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-muted-foreground/25 bg-background text-muted-foreground hover:bg-accent"
                    } ${disabled ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleDay(day.value)}
                    />
                    <span className="text-sm font-semibold">{t(day.labelKey)}</span>
                    <span className="text-[0.65rem] leading-none">
                      {checked ? t("schedule.weekdays.show") : t("schedule.weekdays.exclude")}
                    </span>
                  </label>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => update({ daysOfWeek: [] })}
              >
                {t("schedule.weekdays.reset")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("schedule.weekdaysHint")}
            </p>
          </div>

          {capability === "full" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-start-date`}>{t("schedule.startDate")}</Label>
                <Input
                  id={`${idPrefix}-start-date`}
                  type="date"
                  value={schedule.startDate}
                  onChange={(event) => update({ startDate: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-end-date`}>{t("schedule.endDate")}</Label>
                <Input
                  id={`${idPrefix}-end-date`}
                  type="date"
                  value={schedule.endDate}
                  onChange={(event) => update({ endDate: event.target.value })}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BoardSchedulePanel({
  templateId,
  config,
  mediaItems,
  messages,
  scheduling,
  onChange,
}: BoardSchedulePanelProps) {
  const { t } = useLocale();
  const isSimple = templateId === "simple";
  const isPhotoClock = templateId === "photo-clock";
  if (!isSimple && !isPhotoClock) return null;

  const messageSchedules = getScheduleMap(config.messageSchedules);
  const sortedMedia = [...mediaItems].sort((a, b) => a.displayOrder - b.displayOrder);
  const imageItems = sortedMedia.filter((item) => item.type === "image");
  const fallbackMediaId =
    typeof config.fallbackMediaId === "string" ? config.fallbackMediaId : "";
  const selectedFallbackImage = imageItems.find((item) => item.id === fallbackMediaId);
  const selectedFallback = selectedFallbackImage
    ? numberedImageLabel(selectedFallbackImage, imageItems)
    : null;
  const fallbackLabel = selectedFallbackImage
    ? t("schedule.imageOption", {
      number: selectedFallback?.number ?? 0,
      name: selectedFallback?.name ?? "",
    })
    : t("schedule.fallbackDefault");

  function updateSchedule(kind: "mediaSchedules" | "messageSchedules", id: string, schedule: DisplaySchedule) {
    const currentMap = getScheduleMap(config[kind]);
    const nextMap = sanitizeScheduleMap({
      ...currentMap,
      [id]: schedule,
    });
    onChange({
      ...config,
      [kind]: nextMap,
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4" />
          {t("schedule.title")}
        </h4>
        <p className="text-sm text-muted-foreground">{t(planLabelKey(scheduling))}</p>
      </div>
      {scheduling !== "none" && (
        <div className="space-y-1.5">
          <Label htmlFor="schedule-fallback">{t("schedule.fallbackImage")}</Label>
          <Select
            value={fallbackMediaId || "__none__"}
            onValueChange={(value) =>
              onChange({
                ...config,
                fallbackMediaId: value === "__none__" ? "" : value,
              })
            }
          >
            <SelectTrigger id="schedule-fallback" className="w-full max-w-md">
              <span data-slot="select-value" className="min-w-0 flex-1 truncate text-left">
                {fallbackLabel}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("schedule.fallbackDefault")}</SelectItem>
              {imageItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {t("schedule.imageOption", numberedImageLabel(item, imageItems))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isSimple && scheduling !== "none" && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t("schedule.messageSection")}</h4>
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              {t("schedule.messageEmpty")}
            </p>
          ) : (
            <div className="space-y-2">
              {[...messages]
                .sort((a, b) => b.priority - a.priority)
                .map((message) => {
                  const schedule = normalizeDisplaySchedule(messageSchedules[message.id]);
                  return (
                    <div key={message.id} className="rounded-md border p-3">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <MessageSquare className="size-3" />
                          P{message.priority}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {message.content}
                        </span>
                      </div>
                      <ScheduleControls
                        idPrefix={`message-${message.id}`}
                        schedule={schedule}
                        capability={scheduling}
                        onChange={(nextSchedule) =>
                          updateSchedule("messageSchedules", message.id, nextSchedule)
                        }
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
