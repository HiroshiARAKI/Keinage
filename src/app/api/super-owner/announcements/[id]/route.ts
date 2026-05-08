// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAnnouncements } from "@/db/schema";
import {
  normalizeAnnouncementInput,
  sendAnnouncementEmailToTargets,
  validateAnnouncementInput,
} from "@/lib/admin-announcements";
import { requireSuperOwner, SuperOwnerAuthError, recordSuperOwnerAuditLog } from "@/lib/super-owner";

function authErrorResponse(error: SuperOwnerAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/** PATCH /api/super-owner/announcements/[id] - update an announcement */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSuperOwner(request, {
      auditAction: "announcement_admin_edit_accessed",
    });
    const { id } = await params;
    const existing = await db.query.adminAnnouncements.findFirst({
      where: eq(adminAnnouncements.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const input = normalizeAnnouncementInput(await request.json());
    const validationError = validateAnnouncementInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextStatus = input.publishStatus ?? existing.publishStatus;
    const [announcement] = await db
      .update(adminAnnouncements)
      .set({
        title: input.title,
        body: input.body,
        type: input.type,
        severity: input.severity,
        targetScope: input.targetScope,
        publishStatus: nextStatus,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        sendEmail: input.sendEmail,
        requireAcknowledgement: input.requireAcknowledgement,
        publishedAt: nextStatus === "published"
          ? (existing.publishedAt ?? now)
          : existing.publishedAt,
        updatedAt: now,
      })
      .where(eq(adminAnnouncements.id, id))
      .returning();

    await recordSuperOwnerAuditLog({
      userId: session.user.id,
      action: "announcement_updated",
      targetType: "announcement",
      targetId: announcement.id,
      request,
    });

    const email = announcement.publishStatus === "published"
      && announcement.sendEmail
      && !announcement.emailSentAt
      ? await sendAnnouncementEmailToTargets({
          announcement,
          actorUserId: session.user.id,
          request,
        })
      : null;

    return NextResponse.json({ announcement, email });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) return authErrorResponse(error);
    throw error;
  }
}
