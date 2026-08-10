// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { SupportedLocale } from "@/lib/i18n";

export function formatWeatherFetchedAt(
  value: string,
  locale: SupportedLocale,
  options?: { timeZone?: string },
): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options?.timeZone,
  }).format(date);
}
