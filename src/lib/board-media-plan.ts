// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { PlanLimitError } from "@/lib/plan-enforcement";
import { PLAN_LIMIT_MESSAGE_KEYS } from "@/lib/plan-limit";
import type { PlanCode, PlanDefinition } from "@/lib/plans";

const BOARD_MEDIA_LIMIT_TEMPLATE_IDS = new Set(["simple", "photo-clock"]);

type BoardMediaRow = Pick<
  typeof mediaItems.$inferSelect,
  "type" | "videoDurationSeconds"
>;

export interface BoardMediaLimitUsage {
  applies: boolean;
  planCode: PlanCode;
  planName: string;
  media: {
    used: number;
    limit: number | null;
    atLimit: boolean;
    overLimit: boolean;
  };
  videos: {
    used: number;
    limit: number | null;
    atLimit: boolean;
    overLimit: boolean;
  };
  videoDuration: {
    maxUsedSeconds: number | null;
    limitSeconds: number | null;
    unknownCount: number;
    overLimit: boolean;
  };
}

export function isBoardMediaLimitTemplate(templateId: string) {
  return BOARD_MEDIA_LIMIT_TEMPLATE_IDS.has(templateId);
}

function throwLimit(input: {
  code: "plan_limit_board_media_count" | "plan_limit_board_video_count" | "plan_limit_board_video_duration";
  plan: PlanDefinition;
  limit: number | null;
  usage?: number;
}): never {
  throw new PlanLimitError(
    input.code,
    PLAN_LIMIT_MESSAGE_KEYS[input.code],
    {
      planCode: input.plan.code,
      limit: input.limit,
      usage: input.usage,
    },
  );
}

function createUsage(input: {
  plan: PlanDefinition;
  templateId: string;
  rows: BoardMediaRow[];
}): BoardMediaLimitUsage {
  const applies = isBoardMediaLimitTemplate(input.templateId);
  const videoRows = input.rows.filter((item) => item.type === "video");
  const mediaLimit = applies ? input.plan.limits.boardMediaItems : null;
  const videoLimit = applies ? input.plan.limits.boardVideos : null;
  const videoDurationLimit = applies ? input.plan.limits.boardVideoDurationSeconds : null;
  const knownVideoDurations = videoRows
    .map((item) => item.videoDurationSeconds)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const unknownVideoDurationCount = videoRows.length - knownVideoDurations.length;
  const maxVideoDurationSeconds =
    knownVideoDurations.length > 0 ? Math.max(...knownVideoDurations) : null;

  return {
    applies,
    planCode: input.plan.code,
    planName: input.plan.name,
    media: {
      used: input.rows.length,
      limit: mediaLimit,
      atLimit: mediaLimit !== null && input.rows.length >= mediaLimit,
      overLimit: mediaLimit !== null && input.rows.length > mediaLimit,
    },
    videos: {
      used: videoRows.length,
      limit: videoLimit,
      atLimit: videoLimit !== null && videoRows.length >= videoLimit,
      overLimit: videoLimit !== null && videoRows.length > videoLimit,
    },
    videoDuration: {
      maxUsedSeconds: maxVideoDurationSeconds,
      limitSeconds: videoDurationLimit,
      unknownCount: unknownVideoDurationCount,
      overLimit: videoDurationLimit !== null
        && (
          unknownVideoDurationCount > 0
          || (maxVideoDurationSeconds !== null && maxVideoDurationSeconds > videoDurationLimit)
        ),
    },
  };
}

export async function getBoardMediaLimitUsage(input: {
  ownerUserId: string;
  boardId: string;
  templateId: string;
}): Promise<BoardMediaLimitUsage> {
  const [effectivePlan, rows] = await Promise.all([
    getEffectivePlanForOwner(input.ownerUserId),
    db
      .select({
        type: mediaItems.type,
        videoDurationSeconds: mediaItems.videoDurationSeconds,
      })
      .from(mediaItems)
      .where(eq(mediaItems.boardId, input.boardId)),
  ]);

  return createUsage({
    plan: effectivePlan.plan,
    templateId: input.templateId,
    rows,
  });
}

export async function assertBoardMediaWithinPlan(input: {
  ownerUserId: string;
  boardId: string;
  templateId: string;
}) {
  const effectivePlan = await getEffectivePlanForOwner(input.ownerUserId);
  if (!isBoardMediaLimitTemplate(input.templateId)) return effectivePlan;

  const rows = await db
    .select({
      type: mediaItems.type,
      videoDurationSeconds: mediaItems.videoDurationSeconds,
    })
    .from(mediaItems)
    .where(eq(mediaItems.boardId, input.boardId));
  const usage = createUsage({
    plan: effectivePlan.plan,
    templateId: input.templateId,
    rows,
  });

  if (usage.media.overLimit) {
    throwLimit({
      code: "plan_limit_board_media_count",
      plan: effectivePlan.plan,
      limit: usage.media.limit,
      usage: usage.media.used,
    });
  }
  if (usage.videos.overLimit) {
    throwLimit({
      code: "plan_limit_board_video_count",
      plan: effectivePlan.plan,
      limit: usage.videos.limit,
      usage: usage.videos.used,
    });
  }
  if (usage.videoDuration.overLimit) {
    throwLimit({
      code: "plan_limit_board_video_duration",
      plan: effectivePlan.plan,
      limit: usage.videoDuration.limitSeconds,
      usage: usage.videoDuration.maxUsedSeconds ?? 0,
    });
  }

  return effectivePlan;
}

export async function assertCanAddBoardMedia(input: {
  ownerUserId: string;
  boardId: string;
  templateId: string;
  mediaType: "image" | "video";
  videoDurationSeconds?: number | null;
  requireVideoDuration?: boolean;
}) {
  const effectivePlan = await getEffectivePlanForOwner(input.ownerUserId);
  if (!isBoardMediaLimitTemplate(input.templateId)) return effectivePlan;

  const rows = await db
    .select({
      type: mediaItems.type,
      videoDurationSeconds: mediaItems.videoDurationSeconds,
    })
    .from(mediaItems)
    .where(eq(mediaItems.boardId, input.boardId));
  const usage = createUsage({
    plan: effectivePlan.plan,
    templateId: input.templateId,
    rows,
  });

  if (
    usage.media.limit !== null
    && usage.media.used + 1 > usage.media.limit
  ) {
    throwLimit({
      code: "plan_limit_board_media_count",
      plan: effectivePlan.plan,
      limit: usage.media.limit,
      usage: usage.media.used + 1,
    });
  }

  if (input.mediaType === "video") {
    if (
      usage.videos.limit !== null
      && usage.videos.used + 1 > usage.videos.limit
    ) {
      throwLimit({
        code: "plan_limit_board_video_count",
        plan: effectivePlan.plan,
        limit: usage.videos.limit,
        usage: usage.videos.used + 1,
      });
    }

    if (usage.videoDuration.limitSeconds !== null) {
      const duration = input.videoDurationSeconds ?? null;
      if (input.requireVideoDuration !== false && (!duration || duration <= 0)) {
        throwLimit({
          code: "plan_limit_board_video_duration",
          plan: effectivePlan.plan,
          limit: usage.videoDuration.limitSeconds,
        });
      }
      if (duration !== null && duration > usage.videoDuration.limitSeconds) {
        throwLimit({
          code: "plan_limit_board_video_duration",
          plan: effectivePlan.plan,
          limit: usage.videoDuration.limitSeconds,
          usage: duration,
        });
      }
    }
  }

  return effectivePlan;
}
