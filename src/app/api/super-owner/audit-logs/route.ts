// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireSuperOwner, SuperOwnerAuthError } from "@/lib/super-owner";

function authErrorResponse(error: SuperOwnerAuthError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

function limitFromSearchParam(value: string | null) {
  const parsed = value ? Number(value) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

/** GET /api/super-owner/audit-logs - list global audit logs */
export async function GET(request: NextRequest) {
  try {
    await requireSuperOwner(request, { auditAction: "audit_logs_list" });
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const result = searchParams.get("result");
    const actorUserId = searchParams.get("actor_user_id");
    const targetType = searchParams.get("target_type");
    const createdFrom = searchParams.get("created_from");
    const createdTo = searchParams.get("created_to");
    const limit = limitFromSearchParam(searchParams.get("limit"));

    const conditions = [
      action ? eq(auditLogs.action, action) : null,
      result ? eq(auditLogs.result, result) : null,
      actorUserId ? eq(auditLogs.actorUserId, actorUserId) : null,
      targetType ? eq(auditLogs.targetType, targetType) : null,
      createdFrom ? gte(auditLogs.createdAt, createdFrom) : null,
      createdTo ? lte(auditLogs.createdAt, createdTo) : null,
    ].filter((condition): condition is NonNullable<typeof condition> => !!condition);

    const logs = await db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        result: auditLogs.result,
        reason: auditLogs.reason,
        ipHash: auditLogs.ipHash,
        userAgent: auditLogs.userAgent,
        metadataJson: auditLogs.metadataJson,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) return authErrorResponse(error);
    throw error;
  }
}

