// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_MEDIA_DURATION_SECONDS = 10;
export const MAX_MEDIA_DURATION_SECONDS = 60 * 60;

export const MEDIA_PLAYBACK_MODES = ["duration", "until-ended"] as const;
export type MediaPlaybackMode = (typeof MEDIA_PLAYBACK_MODES)[number];

export function isMediaPlaybackMode(value: unknown): value is MediaPlaybackMode {
  return typeof value === "string"
    && MEDIA_PLAYBACK_MODES.includes(value as MediaPlaybackMode);
}

export function clampMediaDuration(value: unknown) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_MEDIA_DURATION_SECONDS;
  return Math.min(MAX_MEDIA_DURATION_SECONDS, Math.max(1, parsed));
}
