// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { mediaItems } from "@/db/schema";
import type { PlanDefinition } from "@/lib/plans";

export type MediaPlaybackStatus =
  | "available"
  | "plan_video_disabled"
  | "plan_resolution_exceeded";

type MediaLike = Pick<
  typeof mediaItems.$inferSelect,
  "type" | "width" | "height"
>;

export type PlanRestrictedMediaItem<T extends MediaLike = typeof mediaItems.$inferSelect> =
  T & {
    playbackStatus: MediaPlaybackStatus;
  };

export function getMediaPlaybackStatus(
  item: MediaLike,
  plan: PlanDefinition,
): MediaPlaybackStatus {
  if (item.type !== "video") return "available";
  if (!plan.limits.videoEnabled) return "plan_video_disabled";

  const width = item.width ?? null;
  const height = item.height ?? null;
  if (!width || !height || plan.limits.maxResolution === null) {
    return "available";
  }

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const maxShortEdge = plan.limits.maxResolution <= 1920 ? 1080 : 2160;

  return longEdge > plan.limits.maxResolution || shortEdge > maxShortEdge
    ? "plan_resolution_exceeded"
    : "available";
}

export function applyMediaPlanRestrictions<T extends MediaLike>(
  items: T[],
  plan: PlanDefinition,
): Array<PlanRestrictedMediaItem<T>> {
  return items.map((item) => ({
    ...item,
    playbackStatus: getMediaPlaybackStatus(item, plan),
  }));
}
