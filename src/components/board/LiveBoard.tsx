// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { WatermarkOverlay } from "@/components/board/WatermarkOverlay";
import { useSSE } from "@/hooks/useSSE";
import { parseJsonObject } from "@/lib/utils";
import type {
  Board,
  MediaItem,
  Message,
  BoardTemplateProps,
  PublicBoardPlan,
} from "@/types";

const CURSOR_HIDE_DELAY = 3000;
const DEVICE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const DEVICE_KEY_STORAGE_KEY = "keinage-display-device-key";

interface LiveBoardProps {
  board: Board;
  mediaItems: MediaItem[];
  messages: Message[];
  boardPlan: PublicBoardPlan;
  TemplateComponent: React.ComponentType<BoardTemplateProps>;
}

const DEFAULT_PUBLIC_BOARD_PLAN: PublicBoardPlan = {
  watermark: false,
  scheduling: "full",
  menuItemImages: true,
};

function parsePublicBoardPlan(raw: unknown): PublicBoardPlan {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_PUBLIC_BOARD_PLAN;
  }

  return {
    watermark: (raw as Partial<PublicBoardPlan>).watermark === true,
    scheduling:
      (raw as Partial<PublicBoardPlan>).scheduling === "none" ||
      (raw as Partial<PublicBoardPlan>).scheduling === "time_weekday" ||
      (raw as Partial<PublicBoardPlan>).scheduling === "full"
        ? (raw as PublicBoardPlan).scheduling
        : DEFAULT_PUBLIC_BOARD_PLAN.scheduling,
    menuItemImages: (raw as Partial<PublicBoardPlan>).menuItemImages !== false,
  };
}

function createDeviceKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function getOrCreateDeviceKey() {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    if (existing) return existing;
    const created = createDeviceKey();
    window.localStorage.setItem(DEVICE_KEY_STORAGE_KEY, created);
    return created;
  } catch {
    return createDeviceKey();
  }
}

/**
 * Wraps a board template with SSE-based live updates.
 * Initial data comes from server-side rendering (props).
 * Subsequent updates are fetched when SSE events arrive.
 */
export default function LiveBoard({
  board: initialBoard,
  mediaItems: initialMedia,
  messages: initialMessages,
  boardPlan: initialBoardPlan,
  TemplateComponent,
}: LiveBoardProps) {
  const [board, setBoard] = useState(initialBoard);
  const [mediaItems, setMediaItems] = useState(initialMedia);
  const [messages, setMessages] = useState(initialMessages);
  const [boardPlan, setBoardPlan] = useState(initialBoardPlan);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();

  // --- Cursor auto-hide ---
  const startCursorTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCursorVisible(false), CURSOR_HIDE_DELAY);
  }, []);

  const resetCursorTimer = useCallback(() => {
    setCursorVisible(true);
    startCursorTimer();
  }, [startCursorTimer]);

  useEffect(() => {
    startCursorTimer();
    const onMove = () => resetCursorTimer();
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetCursorTimer, startCursorTimer]);

  // --- Fullscreen sync ---
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enterFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
  }, []);

  // --- SSE live updates ---
  const refetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/boards/${initialBoard.id}`);
      if (!res.ok) return;
      const data = await res.json();

      setBoard({
        id: data.id,
        name: data.name,
        ownerUserId: data.ownerUserId,
        visibility: data.visibility,
        templateId: data.templateId,
        config: parseJsonObject(data.config),
        isActive: data.isActive,
        status: data.status,
        lastViewedAt: data.lastViewedAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
      setBoardPlan(parsePublicBoardPlan(data.boardPlan));
      setMediaItems(data.mediaItems ?? []);
      setMessages(data.messages ?? []);
    } catch {
      // Network error; will retry on next SSE event
    }
  }, [initialBoard.id]);

  const handleSSEEvent = useCallback(
    () => {
      // On any event, refetch the full board data
      refetchData();
    },
    [refetchData],
  );

  useSSE({
    boardId: initialBoard.id,
    onEvent: handleSSEEvent,
  });

  useEffect(() => {
    const deviceKey = getOrCreateDeviceKey();
    let stopped = false;

    const sendHeartbeat = async () => {
      if (stopped) return;
      try {
        await fetch(`/api/public/boards/${initialBoard.id}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceKey }),
          keepalive: true,
        });
      } catch {
        // Heartbeat will retry on the next interval.
      }
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, DEVICE_HEARTBEAT_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [initialBoard.id]);

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen"
      style={{ cursor: cursorVisible ? "auto" : "none" }}
    >
      <TemplateComponent
        board={board}
        mediaItems={mediaItems}
        messages={messages}
        boardPlan={boardPlan}
      />
      {boardPlan.watermark && <WatermarkOverlay />}

      {/* Expand / Restore button */}
      <button
        type="button"
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
        className="fixed bottom-4 left-4 z-50 rounded-md bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur transition-opacity hover:bg-black/70"
        style={{
          opacity: cursorVisible ? 1 : 0,
          pointerEvents: cursorVisible ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
        title={isFullscreen ? t("board.fullscreenExit") : t("board.fullscreenEnter")}
      >
        {isFullscreen ? `⤓ ${t("board.restore")}` : `⤢ ${t("board.fullscreenEnter")}`}
      </button>
    </div>
  );
}
