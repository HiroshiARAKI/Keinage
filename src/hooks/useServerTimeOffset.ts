// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useState } from "react";

const SERVER_TIME_RESYNC_INTERVAL_MS = 5 * 60 * 1000;

export function useServerTimeOffset(enabled = true) {
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  const synchronize = useCallback(async () => {
    const requestStartedAt = Date.now();
    try {
      const response = await fetch("/api/time", { cache: "no-store" });
      const responseReceivedAt = Date.now();
      if (!response.ok) return;
      const data = await response.json() as { serverTime?: unknown };
      if (typeof data.serverTime !== "number") return;

      const estimatedClientTime =
        requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
      setServerTimeOffset(data.serverTime - estimatedClientTime);
    } catch {
      // Keep the previous offset and retry at the next interval.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const initialTimer = window.setTimeout(() => {
      void synchronize();
    }, 0);
    const interval = window.setInterval(
      synchronize,
      SERVER_TIME_RESYNC_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [enabled, synchronize]);

  return serverTimeOffset;
}
