// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const SLIDESHOW_TRANSITIONS = [
  "fade-black",
  "fade-white",
  "crossfade",
  "instant",
] as const;

export type SlideshowTransition = (typeof SLIDESHOW_TRANSITIONS)[number];

export function normalizeSlideshowTransition(
  value: unknown,
): SlideshowTransition {
  return SLIDESHOW_TRANSITIONS.includes(value as SlideshowTransition)
    ? (value as SlideshowTransition)
    : "fade-black";
}
