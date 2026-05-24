// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, mediaItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";
import { resolveOwnerUserId } from "@/lib/ownership";
import { clampMediaDuration, isMediaPlaybackMode } from "@/lib/media-duration";
import {
  deleteStoredObject,
  storageKeyFromPublicPath,
  thumbnailStorageKeyFromPublicPath,
} from "@/lib/media-storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const [item] = await db
    .select({
      id: mediaItems.id,
      boardId: mediaItems.boardId,
      filePath: mediaItems.filePath,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(and(eq(mediaItems.id, id), eq(boards.ownerUserId, resolveOwnerUserId(session.user))));
  if (!item) {
    return NextResponse.json(
      { error: "Media item not found" },
      { status: 404 },
    );
  }

  try {
    await deleteStoredObject(storageKeyFromPublicPath(item.filePath));
  } catch {
    // File may already be deleted; continue with DB cleanup
  }

  try {
    await deleteStoredObject(thumbnailStorageKeyFromPublicPath(item.filePath));
  } catch {
    // Thumbnail may already be deleted; continue with DB cleanup
  }

  // Delete from DB
  await db.delete(mediaItems).where(eq(mediaItems.id, id));

  emitSSE(item.boardId, "media-updated");

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const [item] = await db
    .select({
      id: mediaItems.id,
      boardId: mediaItems.boardId,
      type: mediaItems.type,
      duration: mediaItems.duration,
    })
    .from(mediaItems)
    .innerJoin(boards, eq(mediaItems.boardId, boards.id))
    .where(and(eq(mediaItems.id, id), eq(boards.ownerUserId, resolveOwnerUserId(session.user))));
  if (!item) {
    return NextResponse.json(
      { error: "Media item not found" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (
    typeof body === "object" &&
    body !== null &&
    "duration" in body &&
    typeof (body as Record<string, unknown>).duration === "number"
  ) {
    updates.duration = clampMediaDuration((body as Record<string, unknown>).duration);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "playbackMode" in body &&
    isMediaPlaybackMode((body as Record<string, unknown>).playbackMode)
  ) {
    updates.playbackMode = item.type === "video"
      ? (body as Record<string, unknown>).playbackMode
      : "duration";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(item);
  }

  const [updated] = await db
    .update(mediaItems)
    .set(updates)
    .where(eq(mediaItems.id, id))
    .returning();

  emitSSE(item.boardId, "media-updated");

  return NextResponse.json(updated);
}
