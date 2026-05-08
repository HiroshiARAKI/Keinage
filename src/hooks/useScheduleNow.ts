// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";

export function useScheduleNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: number | null = null;

    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60 * 1000);
    }, Math.max(1000, (60 - now.getSeconds()) * 1000));

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [now]);

  return now;
}
