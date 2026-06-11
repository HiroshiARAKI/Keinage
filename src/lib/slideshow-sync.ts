// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import {
  clampMediaDuration,
  DEFAULT_MEDIA_DURATION_SECONDS,
} from "@/lib/media-duration";
import type { MediaItem } from "@/types";

export interface SynchronizedSlidePosition {
  index: number;
  remainingMs: number;
  upcomingIndexes: number[];
}

function mediaDurationMs(item: MediaItem): number {
  const seconds =
    item.type === "video" &&
    item.playbackMode === "until-ended" &&
    item.videoDurationSeconds
      ? item.videoDurationSeconds
      : item.duration ?? DEFAULT_MEDIA_DURATION_SECONDS;
  return clampMediaDuration(seconds) * 1000;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function playbackIndexes(
  length: number,
  playbackOrder: "sequential" | "random",
  syncKey: string,
  cycle: number,
): number[] {
  const indexes = Array.from({ length }, (_, index) => index);
  if (playbackOrder !== "random") return indexes;

  const random = seededRandom(hashSeed(`${syncKey}:${cycle}`));
  for (let index = indexes.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getSynchronizedSlidePosition(input: {
  mediaItems: MediaItem[];
  playbackOrder: "sequential" | "random";
  syncKey: string;
  serverTimeMs: number;
  preloadAhead?: number;
}): SynchronizedSlidePosition {
  const {
    mediaItems,
    playbackOrder,
    syncKey,
    serverTimeMs,
    preloadAhead = 2,
  } = input;

  if (mediaItems.length === 0) {
    return { index: 0, remainingMs: 0, upcomingIndexes: [] };
  }

  const durations = mediaItems.map(mediaDurationMs);
  const cycleDurationMs = durations.reduce(
    (total, duration) => total + duration,
    0,
  );
  const cycle = Math.floor(serverTimeMs / cycleDurationMs);
  const elapsedInCycle = positiveModulo(serverTimeMs, cycleDurationMs);
  const indexes = playbackIndexes(
    mediaItems.length,
    playbackOrder,
    syncKey,
    cycle,
  );

  let elapsed = 0;
  let orderPosition = 0;
  for (let position = 0; position < indexes.length; position++) {
    const duration = durations[indexes[position]];
    if (elapsedInCycle < elapsed + duration) {
      orderPosition = position;
      break;
    }
    elapsed += duration;
  }

  const index = indexes[orderPosition];
  const remainingMs = Math.max(
    1,
    elapsed + durations[index] - elapsedInCycle,
  );
  const upcomingIndexes: number[] = [];
  let nextCycle = cycle;
  let nextOrder = indexes;
  let nextPosition = orderPosition;

  while (
    upcomingIndexes.length < Math.min(preloadAhead, mediaItems.length - 1)
  ) {
    nextPosition += 1;
    if (nextPosition >= nextOrder.length) {
      nextCycle += 1;
      nextOrder = playbackIndexes(
        mediaItems.length,
        playbackOrder,
        syncKey,
        nextCycle,
      );
      nextPosition = 0;
    }
    const upcomingIndex = nextOrder[nextPosition];
    if (
      upcomingIndex !== index &&
      !upcomingIndexes.includes(upcomingIndex)
    ) {
      upcomingIndexes.push(upcomingIndex);
    }
  }

  return { index, remainingMs, upcomingIndexes };
}
