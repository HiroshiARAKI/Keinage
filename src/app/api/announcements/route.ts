// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listVisibleAnnouncementsForUser } from "@/lib/admin-announcements";

/** GET /api/announcements - list published announcements visible to the current user */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const announcements = await listVisibleAnnouncementsForUser(session.user);
  return NextResponse.json({ announcements });
}
