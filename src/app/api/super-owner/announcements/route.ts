// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminAnnouncements } from "@/db/schema";
import {
  listAllAnnouncementsForSuperOwner,
  normalizeAnnouncementInput,
  sendAnnouncementEmailToTargets,
  validateAnnouncementInput,
} from "@/lib/admin-announcements";
import { requireSuperOwner, SuperOwnerAuthError, recordSuperOwnerAuditLog } from "@/lib/super-owner";

function authErrorResponse(error: SuperOwnerAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/** GET /api/super-owner/announcements - list all announcements */
export async function GET(request: NextRequest) {
  try {
    await requireSuperOwner(request, { auditAction: "announcement_admin_list" });
    const announcements = await listAllAnnouncementsForSuperOwner();
    return NextResponse.json({ announcements });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) return authErrorResponse(error);
    throw error;
  }
}

/** POST /api/super-owner/announcements - create an announcement draft */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperOwner(request, {
      auditAction: "announcement_admin_create_accessed",
    });
    const input = normalizeAnnouncementInput(await request.json());
    const validationError = validateAnnouncementInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const now = new Date().toISOString();
    const [announcement] = await db
      .insert(adminAnnouncements)
      .values({
        title: input.title,
        body: input.body,
        type: input.type,
        severity: input.severity,
        targetScope: input.targetScope,
        publishStatus: input.publishStatus ?? "draft",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        sendEmail: input.sendEmail,
        requireAcknowledgement: input.requireAcknowledgement,
        createdBy: session.user.id,
        publishedAt: input.publishStatus === "published" ? now : null,
      })
      .returning();

    await recordSuperOwnerAuditLog({
      userId: session.user.id,
      action: "announcement_created",
      targetType: "announcement",
      targetId: announcement.id,
      request,
    });

    const email = announcement.publishStatus === "published" && announcement.sendEmail
      ? await sendAnnouncementEmailToTargets({
          announcement,
          actorUserId: session.user.id,
          request,
        })
      : null;

    return NextResponse.json({ announcement, email }, { status: 201 });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) return authErrorResponse(error);
    throw error;
  }
}
