// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAnnouncements } from "@/db/schema";
import { requireSuperOwner, SuperOwnerAuthError, recordSuperOwnerAuditLog } from "@/lib/super-owner";

function authErrorResponse(error: SuperOwnerAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

/** POST /api/super-owner/announcements/[id]/archive - archive an announcement */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSuperOwner(request, {
      auditAction: "announcement_archive_accessed",
    });
    const { id } = await params;
    const existing = await db.query.adminAnnouncements.findFirst({
      where: eq(adminAnnouncements.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [announcement] = await db
      .update(adminAnnouncements)
      .set({
        publishStatus: "archived",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(adminAnnouncements.id, id))
      .returning();

    await recordSuperOwnerAuditLog({
      userId: session.user.id,
      action: "announcement_archived",
      targetType: "announcement",
      targetId: announcement.id,
      request,
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) return authErrorResponse(error);
    throw error;
  }
}
