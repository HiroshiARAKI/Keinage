// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { MediaItem } from "@/types";

type SplitViewBoard = {
  templateId: string;
  config: Record<string, unknown>;
};

export function resolveSplitViewMediaReferences<T extends SplitViewBoard>(
  board: T,
  mediaItems: Pick<MediaItem, "id" | "filePath">[],
): T {
  if (board.templateId !== "split-view" || !Array.isArray(board.config.panes)) {
    return board;
  }

  let changed = false;
  const panes = board.config.panes.map((pane) => {
    if (!pane || typeof pane !== "object") return pane;

    const rawPane = pane as Record<string, unknown>;
    const reference = rawPane.mediaPath;
    if (typeof reference !== "string" || !reference) return pane;

    const media = mediaItems.find(
      (item) => item.id === reference || item.filePath === reference,
    );
    if (!media || media.id === reference) return pane;

    changed = true;
    return { ...rawPane, mediaPath: media.id };
  });

  if (!changed) return board;
  return {
    ...board,
    config: {
      ...board.config,
      panes,
    },
  };
}
