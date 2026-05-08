// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { adminAnnouncements, announcementReads, users } from "@/db/schema";
import { getEffectivePlanForUser } from "@/lib/billing";
import { sendPlainTextEmail } from "@/lib/mail";
import { recordSuperOwnerAuditLog } from "@/lib/super-owner";
import type { PlanCode } from "@/lib/plans";

export const ANNOUNCEMENT_TYPES = [
  "info",
  "maintenance",
  "incident",
  "billing",
  "legal",
  "termination",
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const ANNOUNCEMENT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export const ANNOUNCEMENT_TARGET_SCOPES = [
  "all",
  "free",
  "paid",
  "lite",
  "standard",
  "standard_plus",
] as const;
export type AnnouncementTargetScope = (typeof ANNOUNCEMENT_TARGET_SCOPES)[number];

export const ANNOUNCEMENT_PUBLISH_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type AnnouncementPublishStatus = (typeof ANNOUNCEMENT_PUBLISH_STATUSES)[number];

export type AnnouncementRow = typeof adminAnnouncements.$inferSelect;
export type AnnouncementWithReadState = AnnouncementRow & {
  readAt: string | null;
  acknowledgedAt: string | null;
};

export function isAnnouncementType(value: string | null | undefined): value is AnnouncementType {
  return ANNOUNCEMENT_TYPES.includes(value as AnnouncementType);
}

export function isAnnouncementSeverity(
  value: string | null | undefined,
): value is AnnouncementSeverity {
  return ANNOUNCEMENT_SEVERITIES.includes(value as AnnouncementSeverity);
}

export function isAnnouncementTargetScope(
  value: string | null | undefined,
): value is AnnouncementTargetScope {
  return ANNOUNCEMENT_TARGET_SCOPES.includes(value as AnnouncementTargetScope);
}

export function isAnnouncementPublishStatus(
  value: string | null | undefined,
): value is AnnouncementPublishStatus {
  return ANNOUNCEMENT_PUBLISH_STATUSES.includes(value as AnnouncementPublishStatus);
}

export function normalizeAnnouncementInput(body: unknown) {
  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const announcementBody = typeof raw.body === "string" ? raw.body.trim() : "";
  const type = typeof raw.type === "string" && isAnnouncementType(raw.type)
    ? raw.type
    : "info";
  const severity = typeof raw.severity === "string" && isAnnouncementSeverity(raw.severity)
    ? raw.severity
    : "medium";
  const targetScope = typeof raw.targetScope === "string" && isAnnouncementTargetScope(raw.targetScope)
    ? raw.targetScope
    : "all";
  const publishStatus = typeof raw.publishStatus === "string" && isAnnouncementPublishStatus(raw.publishStatus)
    ? raw.publishStatus
    : undefined;

  return {
    title,
    body: announcementBody,
    type,
    severity,
    targetScope,
    publishStatus,
    startsAt: normalizeOptionalIso(raw.startsAt),
    endsAt: normalizeOptionalIso(raw.endsAt),
    sendEmail: raw.sendEmail === true,
    requireAcknowledgement: raw.requireAcknowledgement === true,
  };
}

function normalizeOptionalIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function validateAnnouncementInput(input: ReturnType<typeof normalizeAnnouncementInput>) {
  if (!input.title || input.title.length > 120) {
    return "title_invalid";
  }
  if (!input.body || input.body.length > 8000) {
    return "body_invalid";
  }
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) {
    return "period_invalid";
  }
  return null;
}

function isPublishedNow(announcement: AnnouncementRow, nowIso: string): boolean {
  return announcement.publishStatus === "published"
    && (!announcement.startsAt || announcement.startsAt <= nowIso)
    && (!announcement.endsAt || announcement.endsAt > nowIso);
}

function matchesTargetScope(targetScope: string, planCode: PlanCode): boolean {
  switch (targetScope) {
    case "all":
      return true;
    case "paid":
      return planCode === "lite" || planCode === "standard" || planCode === "standard_plus";
    case "free":
    case "lite":
    case "standard":
    case "standard_plus":
      return planCode === targetScope;
    default:
      return false;
  }
}

export async function canUserViewAnnouncement(
  user: typeof users.$inferSelect,
  announcement: AnnouncementRow,
  nowIso = new Date().toISOString(),
): Promise<boolean> {
  if (!isPublishedNow(announcement, nowIso)) return false;
  const effectivePlan = await getEffectivePlanForUser(user);
  return matchesTargetScope(announcement.targetScope, effectivePlan.plan.code);
}

export async function listVisibleAnnouncementsForUser(
  user: typeof users.$inferSelect,
): Promise<AnnouncementWithReadState[]> {
  const nowIso = new Date().toISOString();
  const candidates = await db
    .select()
    .from(adminAnnouncements)
    .where(
      and(
        eq(adminAnnouncements.publishStatus, "published"),
        or(isNull(adminAnnouncements.startsAt), lte(adminAnnouncements.startsAt, nowIso)),
        or(isNull(adminAnnouncements.endsAt), gt(adminAnnouncements.endsAt, nowIso)),
      ),
    )
    .orderBy(desc(adminAnnouncements.publishedAt), desc(adminAnnouncements.createdAt));

  const visible = [];
  for (const announcement of candidates) {
    if (await canUserViewAnnouncement(user, announcement, nowIso)) {
      visible.push(announcement);
    }
  }

  if (visible.length === 0) return [];

  const reads = await db
    .select()
    .from(announcementReads)
    .where(
      and(
        eq(announcementReads.userId, user.id),
        inArray(announcementReads.announcementId, visible.map((announcement) => announcement.id)),
      ),
    );
  const readMap = new Map(reads.map((read) => [read.announcementId, read]));

  return visible.map((announcement) => {
    const read = readMap.get(announcement.id);
    return {
      ...announcement,
      readAt: read?.readAt ?? null,
      acknowledgedAt: read?.acknowledgedAt ?? null,
    };
  });
}

export async function listAllAnnouncementsForSuperOwner() {
  return db
    .select()
    .from(adminAnnouncements)
    .orderBy(desc(adminAnnouncements.createdAt));
}

export async function markAnnouncementRead(input: {
  announcement: AnnouncementRow;
  user: typeof users.$inferSelect;
  acknowledge?: boolean;
}) {
  const now = new Date().toISOString();
  await db
    .insert(announcementReads)
    .values({
      announcementId: input.announcement.id,
      userId: input.user.id,
      readAt: now,
      acknowledgedAt: input.acknowledge ? now : null,
    })
    .onConflictDoUpdate({
      target: [announcementReads.announcementId, announcementReads.userId],
      set: {
        readAt: now,
        ...(input.acknowledge ? { acknowledgedAt: now } : {}),
        updatedAt: now,
      },
    });
}

export async function sendAnnouncementEmailToTargets(input: {
  announcement: AnnouncementRow;
  actorUserId: string;
  request?: Request | null;
}) {
  const allUsers = await db.select().from(users);
  let sent = 0;
  let failed = 0;

  for (const user of allUsers) {
    if (!(await canUserViewAnnouncement(user, input.announcement))) continue;
    const ok = await sendPlainTextEmail({
      to: user.email,
      subject: `[Keinage] ${input.announcement.title}`,
      lines: [
        input.announcement.title,
        "",
        input.announcement.body,
        "",
        "Keinage",
      ],
    });
    if (ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  const now = new Date().toISOString();
  await db
    .update(adminAnnouncements)
    .set({
      emailSentAt: sent > 0 ? now : input.announcement.emailSentAt,
      emailLastError: failed > 0 ? `${failed} email(s) failed` : null,
      updatedAt: now,
    })
    .where(eq(adminAnnouncements.id, input.announcement.id));

  await recordSuperOwnerAuditLog({
    userId: input.actorUserId,
    action: failed > 0 ? "announcement_email_failed" : "announcement_email_sent",
    targetType: "announcement",
    targetId: input.announcement.id,
    request: input.request,
  });

  return { sent, failed };
}
