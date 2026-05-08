// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseSSEOptions {
  boardId: string;
  onEvent: (event: string, data: Record<string, unknown>) => void;
}

/**
 * React hook that connects to the SSE endpoint for a board
 * and calls onEvent whenever a server event is received.
 * Handles automatic reconnection on disconnect.
 */
export function useSSE({ boardId, onEvent }: UseSSEOptions) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    const es = new EventSource(`/api/sse/${boardId}`);

    // Listen for all named events via the generic message handler
    // Named events (board-updated, media-updated, message-updated)
    const eventTypes = [
      "board-updated",
      "media-updated",
      "message-updated",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current(type, data);
        } catch {
          onEventRef.current(type, {});
        }
      });
    }

    es.addEventListener("connected", () => {
      // Connection established
    });

    es.onerror = () => {
      // EventSource automatically reconnects on error
      // No manual reconnection needed
    };

    return es;
  }, [boardId]);

  useEffect(() => {
    const es = connect();
    return () => {
      es.close();
    };
  }, [connect]);
}
