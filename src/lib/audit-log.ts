// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHash, createHmac, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { isOwnerUser } from "@/lib/ownership";
import { resolveRateLimitClientIp } from "@/lib/rate-limit";
import { sanitizeContext, serverLog } from "@/lib/server-log";

export type AuditActorType =
  | "user"
  | "owner"
  | "shared_user"
  | "super_owner"
  | "system"
  | "stripe_webhook"
  | "anonymous";

export type AuditResult = "success" | "failure" | "skipped" | "denied";
export type AuditMetadata = Record<string, unknown>;

type UserLike = Pick<
  typeof users.$inferSelect,
  "id" | "attribute" | "ownerUserId" | "isSuperOwner"
>;

export function isAuditLogEnabled() {
  return process.env.AUDIT_LOG_ENABLED !== "false";
}

export function resolveAuditActorType(user: UserLike | null | undefined): AuditActorType {
  if (!user) return "anonymous";
  if (user.isSuperOwner) return "super_owner";
  if (isOwnerUser(user)) return "owner";
  return user.ownerUserId || user.attribute === "shared" ? "shared_user" : "user";
}

function hashIp(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  const secret = process.env.AUDIT_LOG_IP_HASH_SECRET?.trim();
  if (secret) {
    return createHmac("sha256", secret).update(ipAddress).digest("hex");
  }
  return createHash("sha256").update(`keinage-audit-ip:${ipAddress}`).digest("hex");
}

export function getAuditRequestContext(request?: NextRequest | Request | null) {
  const userAgent = request?.headers.get("user-agent")?.slice(0, 512) ?? null;
  if (!request || !("nextUrl" in request)) {
    return { ipHash: null, userAgent };
  }

  return {
    ipHash: hashIp(resolveRateLimitClientIp(request)),
    userAgent,
  };
}

function serializeMetadata(metadata?: AuditMetadata | null): string | null {
  if (!metadata) return null;
  const sanitized = sanitizeContext(metadata);
  const serialized = JSON.stringify(sanitized);
  return serialized.length > 8192
    ? JSON.stringify({ truncated: true, preview: serialized.slice(0, 8192) })
    : serialized;
}

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  actorType?: AuditActorType;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: AuditResult;
  reason?: string | null;
  request?: NextRequest | Request | null;
  metadata?: AuditMetadata | null;
  terminal?: boolean;
}) {
  const requestContext = getAuditRequestContext(input.request);
  const eventId = randomUUID();
  const actorType = input.actorType ?? (input.actorUserId ? "user" : "anonymous");
  const metadataJson = serializeMetadata({ eventId, ...(input.metadata ?? {}) });

  if (input.terminal !== false) {
    serverLog(
      input.result === "failure" || input.result === "denied" ? "warn" : "info",
      "audit",
      input.action,
      {
        eventId,
        actorUserId: input.actorUserId ?? null,
        actorType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        result: input.result,
        reason: input.reason ?? null,
        metadata: input.metadata ?? null,
      },
    );
  }

  if (!isAuditLogEnabled()) {
    return;
  }

  try {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      actorType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      result: input.result,
      reason: input.reason ?? null,
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
      metadataJson,
    });
  } catch (error) {
    serverLog("error", "audit", "failed_to_write_audit_log", {
      eventId,
      action: input.action,
      result: input.result,
      error,
    });
  }
}

export async function writeUserAuditLog(input: {
  user?: UserLike | null;
  action: string;
  targetType?: string;
  targetId?: string | null;
  result: AuditResult;
  reason?: string | null;
  request?: NextRequest | Request | null;
  metadata?: AuditMetadata | null;
  terminal?: boolean;
}) {
  await writeAuditLog({
    actorUserId: input.user?.id ?? null,
    actorType: resolveAuditActorType(input.user),
    action: input.action,
    targetType: input.targetType ?? "user",
    targetId: input.targetId ?? input.user?.id ?? null,
    result: input.result,
    reason: input.reason,
    request: input.request,
    metadata: input.metadata,
    terminal: input.terminal,
  });
}

