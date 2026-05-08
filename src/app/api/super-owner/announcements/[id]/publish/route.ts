// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAnnouncements } from "@/db/schema";
import { sendAnnouncementEmailToTargets } from "@/lib/admin-announcements";
import { requireSuperOwner, SuperOwnerAuthError, recordSuperOwnerAuditLog } from "@/lib/super-owner";

function authErrorResponse(error: SuperOwnerAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/** POST /api/super-owner/announcements/[id]/publish - publish an announcement */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSuperOwner(request, {
      auditAction: "announcement_publish_accessed",
    });
    const { id } = await params;
    const existing = await db.query.adminAnnouncements.findFirst({
      where: eq(adminAnnouncements.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const [announcement] = await db
      .update(adminAnnouncements)
      .set({
        publishStatus: "published",
        publishedAt: existing.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(adminAnnouncements.id, id))
      .returning();

    await recordSuperOwnerAuditLog({
      userId: session.user.id,
      action: "announcement_published",
      targetType: "announcement",
      targetId: announcement.id,
      request,
    });

    const email = announcement.sendEmail && !announcement.emailSentAt
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
