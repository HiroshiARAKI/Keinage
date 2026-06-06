// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, ne, and, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  setSharedUserPlanStatus,
  SharedUserLimitError,
  sharedUserLimitErrorBody,
} from "@/lib/shared-user-plan";

/** PATCH /api/users/[id] — update user role (admin only) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { role, status } = body as {
    role?: string;
    status?: "active" | "inactive_due_to_plan";
  };

  if (
    role !== undefined
    && role !== "admin"
    && role !== "general"
  ) {
    return NextResponse.json(
      { error: "role は 'admin' または 'general' を指定してください" },
      { status: 400 },
    );
  }
  if (
    status !== undefined
    && status !== "active"
    && status !== "inactive_due_to_plan"
  ) {
    return NextResponse.json(
      { error: "status は 'active' または 'inactive_due_to_plan' を指定してください" },
      { status: 400 },
    );
  }
  if (role === undefined && status === undefined) {
    return NextResponse.json({ error: "更新内容が必要です" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  const ownerUserId = resolveOwnerUserId(session.user);
  if (target.attribute === "owner" || target.ownerUserId !== ownerUserId) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  // Prevent removing the last admin
  if (role !== undefined && target.role === "admin" && role === "general") {
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.role, "admin"),
        ne(users.id, id),
        eq(users.status, "active"),
        or(
          eq(users.id, ownerUserId),
          eq(users.ownerUserId, ownerUserId),
        ),
      ));
    if (otherAdmins.length === 0) {
      return NextResponse.json(
        { error: "管理者ユーザーは最低1人必要です" },
        { status: 400 },
      );
    }
  }

  if (role !== undefined) {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }
  if (status !== undefined) {
    try {
      await setSharedUserPlanStatus({ ownerUserId, userId: id, status });
    } catch (error) {
      if (error instanceof SharedUserLimitError) {
        return NextResponse.json(sharedUserLimitErrorBody(error), { status: 403 });
      }
      throw error;
    }
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/users/[id] — delete user (admin only, cannot delete last admin) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const { id } = await params;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  const ownerUserId = resolveOwnerUserId(session.user);
  if (target.attribute === "owner" || target.ownerUserId !== ownerUserId) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }
  if (target.attribute === "owner") {
    return NextResponse.json(
      { error: "Ownerユーザーは削除できません" },
      { status: 400 },
    );
  }

  // Prevent deleting the last admin
  if (target.role === "admin") {
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.role, "admin"),
        ne(users.id, id),
        eq(users.status, "active"),
        or(
          eq(users.id, ownerUserId),
          eq(users.ownerUserId, ownerUserId),
        ),
      ));
    if (otherAdmins.length === 0) {
      return NextResponse.json(
        { error: "管理者ユーザーは最低1人必要です。削除できません。" },
        { status: 400 },
      );
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
