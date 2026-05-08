// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { DateTimeClock } from "@/components/board/DateTimeClock";
import { WeatherDisplay } from "@/components/board/WeatherDisplay";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps, Message } from "@/types";

/** Default config for the Message Board template */
export const messageBoardDefaultConfig = {
  maxDisplayCount: 10,
  fontSize: 20 as number,
  backgroundColor: "#1e293b",
  textColor: "#f8fafc",
  accentColor: "#3b82f6",
  showClock: false,
  showWeather: false,
  fontFamily: "",
  timestampSize: "medium" as "small" | "medium" | "large",
};

type MessageBoardConfig = typeof messageBoardDefaultConfig;

/** Migration map: old Tailwind class → pixel size */
const tailwindToPx: Record<string, number> = {
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
};

function parseConfig(raw: unknown): MessageBoardConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<MessageBoardConfig>;
  // Migrate old Tailwind class values to pixel numbers
  let fontSize = messageBoardDefaultConfig.fontSize;
  if (typeof cfg.fontSize === "string" && cfg.fontSize in tailwindToPx) {
    fontSize = tailwindToPx[cfg.fontSize];
  } else if (typeof cfg.fontSize === "number" && cfg.fontSize > 0) {
    fontSize = cfg.fontSize;
  }
  return { ...messageBoardDefaultConfig, ...cfg, fontSize };
}

/** Priority badge color */
function priorityColor(priority: number): string {
  if (priority >= 5) return "#ef4444"; // red — urgent
  if (priority >= 3) return "#f59e0b"; // amber — high
  return "#6b7280"; // gray — normal
}

type MessageKind = "info" | "notice" | "alert";

function messageKind(value: string | null | undefined): MessageKind {
  return value === "notice" || value === "warning"
    ? "notice"
    : value === "alert"
    ? value
    : "info";
}

function kindStyle(kind: MessageKind) {
  switch (kind) {
    case "alert":
      return { backgroundColor: "#dc2626", color: "#ffffff" };
    case "notice":
      return { backgroundColor: "#f59e0b", color: "#111827" };
    case "info":
    default:
      return { backgroundColor: "#0f766e", color: "#ffffff" };
  }
}

function kindLabel(kind: MessageKind) {
  return `board.message.kind.${kind}` as const;
}

function priorityLabel(priority: number): string {
  if (priority >= 5) return "board.message.priorityUrgent";
  if (priority >= 3) return "board.message.priorityHigh";
  return "board.message.priorityNormal";
}

function timestampFontSize(size: MessageBoardConfig["timestampSize"]) {
  if (size === "large") return 16;
  if (size === "small") return 12;
  return 14;
}

/** Check if a message is expired */
function isExpired(msg: Message): boolean {
  if (!msg.expiresAt) return false;
  return new Date(msg.expiresAt) <= new Date();
}

export default function MessageBoard({
  board,
  messages,
}: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const { t, formatDateTime } = useLocale();

  const [currentMessages, setCurrentMessages] = useState<Message[]>(() =>
    messages
      .filter((m) => !isExpired(m))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, config.maxDisplayCount)
  );

  // Track "new" message IDs for highlight — IDs present on first render are not new
  const [knownIds] = useState<Set<string>>(() => new Set(messages.map((m) => m.id)));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Poll for updated messages from the server
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/boards/${board.id}/messages`);
      if (!res.ok) return;
      const data: Message[] = await res.json();
      const sorted = data
        .sort((a, b) => b.priority - a.priority)
        .slice(0, config.maxDisplayCount);

      // Detect new messages
      const freshIds = new Set<string>();
      for (const m of sorted) {
        if (!knownIds.has(m.id)) {
          freshIds.add(m.id);
          knownIds.add(m.id);
        }
      }
      if (freshIds.size > 0) {
        setNewIds((prev) => new Set([...prev, ...freshIds]));
        // Clear "new" highlight after 5 seconds
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            for (const id of freshIds) next.delete(id);
            return next;
          });
        }, 5000);
      }

      setCurrentMessages(sorted);
    } catch {
      // silently ignore fetch errors
    }
  }, [board.id, config.maxDisplayCount, knownIds]);

  useEffect(() => {
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: config.backgroundColor, color: config.textColor, fontFamily: config.fontFamily || undefined }}
    >
      {config.fontFamily && (
        <GoogleFontLoader fonts={[config.fontFamily]} />
      )}
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: config.accentColor + "40" }}
      >
        <h1 className="text-2xl font-bold">{board.name}</h1>
        <div className="flex items-center gap-4">
          {config.showClock && (
            <DateTimeClock
              timeFontSize={20}
              color={config.textColor}
              bgOpacity={0}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          )}
          <div className="flex items-center gap-2 text-sm opacity-60">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
            {t("common.live")}
          </div>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {currentMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center opacity-40">
            <p style={{ fontSize: `${config.fontSize}px` }}>{t("board.message.none")}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {currentMessages.map((msg) => {
              const isNew = newIds.has(msg.id);
              const kind = messageKind(msg.kind);
              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.3 }}
                  className="mb-3 rounded-lg border p-4"
                  style={{
                    borderColor: isNew ? config.accentColor : config.accentColor + "20",
                    backgroundColor: isNew
                      ? config.accentColor + "15"
                      : config.backgroundColor,
                    boxShadow: isNew
                      ? `0 0 12px ${config.accentColor}40`
                      : "none",
                  }}
                >
                  <div className="mb-1 flex items-center gap-3">
                    {kind !== "info" && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-bold"
                        style={kindStyle(kind)}
                      >
                        {t(kindLabel(kind))}
                      </span>
                    )}
                    {msg.priority >= 3 && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: priorityColor(msg.priority) }}
                      >
                        {t(priorityLabel(msg.priority) as "board.message.priorityUrgent" | "board.message.priorityHigh")}
                      </span>
                    )}

                    {isNew && (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-bold"
                        style={{
                          color: config.accentColor,
                          border: `1px solid ${config.accentColor}`,
                        }}
                      >
                        {t("board.message.new")}
                      </span>
                    )}

                    <span className="ml-auto text-xs opacity-50">
                      <span style={{ fontSize: timestampFontSize(config.timestampSize) }}>
                        {t("board.message.createdAt", { value: formatDateTime(msg.createdAt) })}
                      </span>
                    </span>

                    {/* Expiry indicator */}
                    {msg.expiresAt && (
                      <span className="text-xs opacity-40">
                        {t("board.message.expiresAt", { value: formatDateTime(msg.expiresAt) })}
                      </span>
                    )}
                  </div>
                  <p className="leading-relaxed" style={{ fontSize: `${config.fontSize}px` }}>{msg.content}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Weather bar */}
      {config.showWeather && (
        <div
          className="border-t px-6 py-2"
          style={{ borderColor: config.accentColor + "40" }}
        >
          <WeatherDisplay
            boardId={board.id}
            color={config.textColor}
            bgOpacity={0}
            fontFamily={config.fontFamily || undefined}
          />
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t px-6 py-2 text-xs opacity-40"
        style={{ borderColor: config.accentColor + "40" }}
      >
        <span>{t("board.message.itemsVisible", { count: currentMessages.length })}</span>
        <span>{t("board.message.autoRefresh", { seconds: 3 })}</span>
      </div>
    </div>
  );
}
