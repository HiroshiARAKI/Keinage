// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  authSessions,
  sharedSignupRequests,
  users,
} from "@/db/schema";
import { getEffectivePlanForOwner } from "@/lib/billing";
import type { MessageKey } from "@/lib/i18n";
import type { PlanCode } from "@/lib/plans";
import { getPlanDefinition } from "@/lib/plans";

export const SHARED_USER_STATUSES = [
  "active",
  "disabled",
  "inactive_due_to_plan",
] as const;
export type SharedUserStatus = (typeof SHARED_USER_STATUSES)[number];

export const SHARED_INVITATION_STATUSES = [
  "invited",
  "inactive_due_to_plan",
  "completed",
  "revoked",
] as const;
export type SharedInvitationStatus = (typeof SHARED_INVITATION_STATUSES)[number];

export interface SharedUserPlanUsage {
  activeUsers: number;
  invitedUsers: number;
  inactiveDueToPlanUsers: number;
  inactiveDueToPlanInvitations: number;
  used: number;
  limit: number | null;
  nearLimit: boolean;
  atLimit: boolean;
  planCode: PlanCode;
  planName: string;
}

type SharedUserPlanTransaction =
  Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SharedUserLimitError extends Error {
  readonly code = "plan_limit_shared_user_count";
  readonly messageKey: MessageKey = "planLimit.sharedUserCount";

  constructor(readonly usage: SharedUserPlanUsage) {
    super("shared_user_limit_reached");
  }
}

export function normalizeSharedUserStatus(
  value: string | null | undefined,
): SharedUserStatus {
  return SHARED_USER_STATUSES.includes(value as SharedUserStatus)
    ? value as SharedUserStatus
    : "active";
}

export function isSharedUserLoginAllowed(user: {
  attribute: string;
  status?: string | null;
}) {
  return user.attribute !== "shared" || normalizeSharedUserStatus(user.status) === "active";
}

export function sharedUserLimitErrorBody(error: SharedUserLimitError) {
  return {
    error: `現在のプランではShared userを${error.usage.limit}人まで利用できます。不要なShared userを無効にするか、上位プランへ変更してください。`,
    code: error.code,
    messageKey: error.messageKey,
    planCode: error.usage.planCode,
    limit: error.usage.limit,
    usage: error.usage.used,
    upgradeRequired: true,
  };
}

export async function getSharedUserPlanUsage(
  ownerUserId: string,
  client: Pick<SharedUserPlanTransaction, "select"> | typeof db = db,
): Promise<SharedUserPlanUsage> {
  const now = new Date().toISOString();
  const [effectivePlan, sharedUsers, activeInvitations] = await Promise.all([
    getEffectivePlanForOwner(ownerUserId),
    client
      .select({ status: users.status })
      .from(users)
      .where(and(
        eq(users.ownerUserId, ownerUserId),
        eq(users.attribute, "shared"),
      )),
    client
      .select({ status: sharedSignupRequests.status })
      .from(sharedSignupRequests)
      .where(and(
        eq(sharedSignupRequests.ownerUserId, ownerUserId),
        isNull(sharedSignupRequests.completedAt),
        gt(sharedSignupRequests.expiresAt, now),
        ne(sharedSignupRequests.status, "revoked"),
      )),
  ]);

  const activeUsers = sharedUsers.filter(
    (user) => normalizeSharedUserStatus(user.status) === "active",
  ).length;
  const inactiveDueToPlanUsers = sharedUsers.filter(
    (user) => normalizeSharedUserStatus(user.status) === "inactive_due_to_plan",
  ).length;
  const invitedUsers = activeInvitations.filter(
    (invitation) => invitation.status === "invited",
  ).length;
  const inactiveDueToPlanInvitations = activeInvitations.filter(
    (invitation) => invitation.status === "inactive_due_to_plan",
  ).length;
  const used = activeUsers + invitedUsers;
  const limit = effectivePlan.plan.limits.sharedUsers;

  return {
    activeUsers,
    invitedUsers,
    inactiveDueToPlanUsers,
    inactiveDueToPlanInvitations,
    used,
    limit,
    nearLimit: limit !== null && used < limit && used >= Math.max(1, Math.floor(limit * 0.8)),
    atLimit: limit !== null && used >= limit,
    planCode: effectivePlan.plan.code,
    planName: effectivePlan.plan.name,
  };
}

export async function assertCanInviteSharedUser(
  ownerUserId: string,
  client?: Pick<SharedUserPlanTransaction, "select">,
) {
  const usage = await getSharedUserPlanUsage(ownerUserId, client);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new SharedUserLimitError(usage);
  }
  return usage;
}

export async function withSharedUserPlanLock<T>(
  ownerUserId: string,
  callback: (transaction: SharedUserPlanTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`shared-users:${ownerUserId}`}))`,
    );
    return callback(transaction);
  });
}

export async function assertCanCompleteSharedInvitation(
  ownerUserId: string,
  client?: Pick<SharedUserPlanTransaction, "select">,
) {
  const usage = await getSharedUserPlanUsage(ownerUserId, client);
  // The invitation being completed is already included in `used`.
  if (usage.limit !== null && usage.used > usage.limit) {
    throw new SharedUserLimitError(usage);
  }
  return usage;
}

export async function setSharedUserPlanStatus(input: {
  ownerUserId: string;
  userId: string;
  status: "active" | "inactive_due_to_plan";
}) {
  return withSharedUserPlanLock(input.ownerUserId, async (transaction) => {
    const target = await transaction.query.users.findFirst({
      where: and(
        eq(users.id, input.userId),
        eq(users.ownerUserId, input.ownerUserId),
        eq(users.attribute, "shared"),
      ),
    });
    if (!target) return false;

    if (
      input.status === "active"
      && normalizeSharedUserStatus(target.status) !== "active"
    ) {
      await assertCanInviteSharedUser(input.ownerUserId, transaction);
    }

    await transaction
      .update(users)
      .set({ status: input.status, updatedAt: new Date().toISOString() })
      .where(eq(users.id, input.userId));

    if (input.status !== "active") {
      await transaction
        .delete(authSessions)
        .where(eq(authSessions.userId, input.userId));
    }
    return true;
  });
}

export async function reconcileSharedUsersForPlan(input: {
  ownerUserId: string;
  targetPlanCode: PlanCode;
}) {
  return withSharedUserPlanLock(input.ownerUserId, async (transaction) => {
    const limit = getPlanDefinition(input.targetPlanCode).limits.sharedUsers;
    const now = new Date().toISOString();
    const [sharedUsers, invitations] = await Promise.all([
      transaction
        .select()
        .from(users)
        .where(and(
          eq(users.ownerUserId, input.ownerUserId),
          eq(users.attribute, "shared"),
          inArray(users.status, ["active", "inactive_due_to_plan"]),
        ))
        .orderBy(asc(users.createdAt)),
      transaction
        .select()
        .from(sharedSignupRequests)
        .where(and(
          eq(sharedSignupRequests.ownerUserId, input.ownerUserId),
          isNull(sharedSignupRequests.completedAt),
          gt(sharedSignupRequests.expiresAt, now),
          inArray(sharedSignupRequests.status, ["invited", "inactive_due_to_plan"]),
        ))
        .orderBy(asc(sharedSignupRequests.createdAt)),
    ]);

    const orderedUsers = [
      ...sharedUsers.filter((user) => normalizeSharedUserStatus(user.status) === "active"),
      ...sharedUsers.filter((user) => normalizeSharedUserStatus(user.status) !== "active"),
    ];
    const activeUserIds = new Set(
      (limit === null ? orderedUsers : orderedUsers.slice(0, limit)).map((user) => user.id),
    );
    const remainingSlots = limit === null
      ? null
      : Math.max(limit - activeUserIds.size, 0);
    const orderedInvitations = [
      ...invitations.filter((invitation) => invitation.status === "invited"),
      ...invitations.filter((invitation) => invitation.status !== "invited"),
    ];
    const invitedIds = new Set(
      (remainingSlots === null
        ? orderedInvitations
        : orderedInvitations.slice(0, remainingSlots)
      ).map((invitation) => invitation.id),
    );

    const deactivatedUserIds = orderedUsers
      .filter((user) => !activeUserIds.has(user.id))
      .map((user) => user.id);

    if (orderedUsers.length > 0) {
      await Promise.all(orderedUsers.map((user) => transaction
        .update(users)
        .set({
          status: activeUserIds.has(user.id) ? "active" : "inactive_due_to_plan",
          updatedAt: now,
        })
        .where(eq(users.id, user.id))));
    }

    if (orderedInvitations.length > 0) {
      await Promise.all(orderedInvitations.map((invitation) => transaction
        .update(sharedSignupRequests)
        .set({
          status: invitedIds.has(invitation.id) ? "invited" : "inactive_due_to_plan",
          updatedAt: now,
        })
        .where(eq(sharedSignupRequests.id, invitation.id))));
    }

    if (deactivatedUserIds.length > 0) {
      await transaction
        .delete(authSessions)
        .where(inArray(authSessions.userId, deactivatedUserIds));
    }

    return {
      activeUserIds: [...activeUserIds],
      invitedIds: [...invitedIds],
      inactiveUserIds: deactivatedUserIds,
    };
  });
}
