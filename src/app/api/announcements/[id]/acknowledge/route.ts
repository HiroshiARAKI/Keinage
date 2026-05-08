// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAnnouncements } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  canUserViewAnnouncement,
  markAnnouncementRead,
} from "@/lib/admin-announcements";

/** POST /api/announcements/[id]/acknowledge - mark an announcement as acknowledged */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const announcement = await db.query.adminAnnouncements.findFirst({
    where: eq(adminAnnouncements.id, id),
  });
  if (!announcement || !(await canUserViewAnnouncement(session.user, announcement))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await markAnnouncementRead({ announcement, user: session.user, acknowledge: true });
  return NextResponse.json({ ok: true });
}
