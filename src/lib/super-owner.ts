// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, superOwnerAuditLogs, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { GOOGLE_AUTH_PROVIDER } from "@/lib/google-auth";
import { isOwnerUser } from "@/lib/ownership";
import { resolveRateLimitClientIp } from "@/lib/rate-limit";

type UserLike = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "attribute" | "ownerUserId" | "role" | "isSuperOwner"
>;

export class SuperOwnerAuthError extends Error {
  constructor(
    message: string,
    public readonly status = 403,
  ) {
    super(message);
  }
}

export function isSuperOwnerUser(user: Pick<UserLike, "isSuperOwner">): boolean {
  return user.isSuperOwner === true;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function isEnvEnabled(value: string | null | undefined): boolean {
  return value === "true";
}

function getBootstrapConfig() {
  return {
    enabled: isEnvEnabled(process.env.SUPER_OWNER_BOOTSTRAP_ENABLED),
    email: normalizeEmail(process.env.SUPER_OWNER_EMAIL),
    requireGoogle: isEnvEnabled(process.env.SUPER_OWNER_REQUIRE_GOOGLE),
  };
}

function hashIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  return createHash("sha256").update(ipAddress).digest("hex");
}

function getAuditContext(request?: NextRequest | Request | null) {
  const userAgent = request?.headers.get("user-agent")?.slice(0, 512) ?? null;
  if (!request || !("nextUrl" in request)) {
    return { ipHash: null, userAgent };
  }

  return {
    ipHash: hashIpAddress(resolveRateLimitClientIp(request)),
    userAgent,
  };
}

async function hasGoogleAccount(userId: string): Promise<boolean> {
  const account = await db.query.authAccounts.findFirst({
    where: and(
      eq(authAccounts.userId, userId),
      eq(authAccounts.provider, GOOGLE_AUTH_PROVIDER),
    ),
  });
  return !!account;
}

export async function findSuperOwner() {
  return db.query.users.findFirst({
    where: eq(users.isSuperOwner, true),
  });
}

export async function recordSuperOwnerAuditLog(input: {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string | null;
  request?: NextRequest | Request | null;
}) {
  const context = getAuditContext(input.request);
  await db.insert(superOwnerAuditLogs).values({
    userId: input.userId,
    action: input.action,
    targetType: input.targetType ?? "super_owner",
    targetId: input.targetId ?? null,
    ipHash: context.ipHash,
    userAgent: context.userAgent,
  });
  await writeAuditLog({
    actorUserId: input.userId,
    actorType: "super_owner",
    action: input.action,
    targetType: input.targetType ?? "super_owner",
    targetId: input.targetId ?? null,
    result: "success",
    request: input.request,
  });
}

export async function maybeBootstrapSuperOwner(input: {
  user: UserLike;
  emailVerified: boolean;
  authenticatedProvider: "credentials" | "google";
  request?: NextRequest | Request | null;
}): Promise<boolean> {
  const config = getBootstrapConfig();
  if (!config.enabled || !config.email) return false;
  if (input.user.isSuperOwner) return false;
  if (!isOwnerUser(input.user) || input.user.role !== "admin") return false;
  if (!input.emailVerified) return false;
  if (normalizeEmail(input.user.email) !== config.email) return false;

  const existingSuperOwner = await findSuperOwner();
  if (existingSuperOwner) return false;

  if (config.requireGoogle) {
    const authenticatedWithGoogle = input.authenticatedProvider === "google";
    const linkedGoogleAccount = authenticatedWithGoogle
      ? true
      : await hasGoogleAccount(input.user.id);
    if (!linkedGoogleAccount || !authenticatedWithGoogle) return false;
  }

  const now = new Date().toISOString();
  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        isSuperOwner: true,
        superOwnerGrantedAt: now,
      })
      .where(
        and(
          eq(users.id, input.user.id),
          eq(users.isSuperOwner, false),
          eq(users.attribute, "owner"),
          isNull(users.ownerUserId),
          eq(users.role, "admin"),
        ),
      )
      .returning({ id: users.id });

    if (!updatedUser) return false;

    await recordSuperOwnerAuditLog({
      userId: input.user.id,
      action: "super_owner_granted",
      targetType: "user",
      targetId: input.user.id,
      request: input.request,
    });
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return false;
    }
    throw error;
  }
}

export async function requireSuperOwner(
  request?: NextRequest | Request | null,
  options?: { auditAction?: string },
) {
  const session = await getSessionUser();
  if (!session) {
    throw new SuperOwnerAuthError("Authentication required", 401);
  }
  if (!isSuperOwnerUser(session.user)) {
    throw new SuperOwnerAuthError("Super Owner permission required", 403);
  }

  await recordSuperOwnerAuditLog({
    userId: session.user.id,
    action: options?.auditAction ?? "super_owner_api_accessed",
    targetType: "api",
    targetId: request ? new URL(request.url).pathname : null,
    request,
  });

  return session;
}
