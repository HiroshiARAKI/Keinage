// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { getSynchronizedSlidePosition } from "@/lib/slideshow-sync";
import type { MediaItem } from "@/types";

function media(
  id: string,
  duration: number,
  overrides: Partial<MediaItem> = {},
): MediaItem {
  return {
    id,
    boardId: "board-1",
    type: "image",
    filePath: `/uploads/${id}.jpg`,
    fileSizeBytes: 0,
    thumbnailSizeBytes: 0,
    width: null,
    height: null,
    videoDurationSeconds: null,
    displayOrder: 0,
    duration,
    playbackMode: "duration",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("selects a sequential slide from absolute server time", () => {
  const mediaItems = [media("a", 10), media("b", 20), media("c", 30)];

  assert.deepEqual(
    getSynchronizedSlidePosition({
      mediaItems,
      playbackOrder: "sequential",
      syncKey: "board-1",
      serverTimeMs: 35_000,
    }),
    {
      index: 2,
      remainingMs: 25_000,
      upcomingIndexes: [0, 1],
    },
  );
});

test("late clients join the same slide and cycle", () => {
  const mediaItems = [media("a", 10), media("b", 20), media("c", 30)];
  const input = {
    mediaItems,
    playbackOrder: "sequential" as const,
    syncKey: "board-1",
    serverTimeMs: 125_000,
  };

  assert.deepEqual(
    getSynchronizedSlidePosition(input),
    getSynchronizedSlidePosition(input),
  );
  assert.equal(getSynchronizedSlidePosition(input).index, 0);
});

test("clock offsets make skewed clients select the same slide", () => {
  const mediaItems = [media("a", 10), media("b", 20), media("c", 30)];
  const serverTimeMs = 35_000;
  const fastClientTimeMs = serverTimeMs + 120_000;
  const slowClientTimeMs = serverTimeMs - 90_000;

  const fastClient = getSynchronizedSlidePosition({
    mediaItems,
    playbackOrder: "sequential",
    syncKey: "board-1",
    serverTimeMs: fastClientTimeMs - 120_000,
  });
  const slowClient = getSynchronizedSlidePosition({
    mediaItems,
    playbackOrder: "sequential",
    syncKey: "board-1",
    serverTimeMs: slowClientTimeMs + 90_000,
  });

  assert.deepEqual(fastClient, slowClient);
});

test("uses video metadata for until-ended timeline slots", () => {
  const mediaItems = [
    media("video", 10, {
      type: "video",
      playbackMode: "until-ended",
      videoDurationSeconds: 42,
    }),
    media("image", 10),
  ];

  const position = getSynchronizedSlidePosition({
    mediaItems,
    playbackOrder: "sequential",
    syncKey: "board-1",
    serverTimeMs: 41_000,
  });

  assert.equal(position.index, 0);
  assert.equal(position.remainingMs, 1_000);
});

test("random playback is deterministic for a board and cycle", () => {
  const mediaItems = [
    media("a", 10),
    media("b", 10),
    media("c", 10),
    media("d", 10),
  ];
  const input = {
    mediaItems,
    playbackOrder: "random" as const,
    syncKey: "board-1",
    serverTimeMs: 15_000,
  };

  assert.deepEqual(
    getSynchronizedSlidePosition(input),
    getSynchronizedSlidePosition(input),
  );
});
