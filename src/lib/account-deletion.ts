// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountDeletionRequests,
  boards,
  deletedOwnerBillingRecords,
  mediaItems,
  messages,
  ownerSubscriptions,
  settings,
  type users as usersTable,
  users,
} from "@/db/schema";
import { getBillingConfig } from "@/lib/plans";
import { cancelStripeSubscriptionImmediately } from "@/lib/stripe-billing";
import {
  deleteStoredObject,
  storageKeyFromPublicPath,
  thumbnailStorageKeyFromPublicPath,
} from "@/lib/media-storage";

export const ACCOUNT_DELETION_TOKEN_TTL_MS = 10 * 60 * 1000;

export type AccountDeletionSummary = {
  userCount: number;
  sharedUserCount: number;
  boardCount: number;
  mediaCount: number;
  messageCount: number;
  settingCount: number;
  preferenceCount: number;
};

type OwnerDeletionData = {
  sharedUserIds: string[];
  boardIds: string[];
  mediaFilePaths: string[];
  summary: AccountDeletionSummary;
};

type OwnerUserForDeletion = Pick<typeof usersTable.$inferSelect, "id" | "email">;

const STRIPE_CANCELABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

export function generateAccountDeletionToken(): string {
  return randomUUID();
}

export function computeAccountDeletionExpiry(): string {
  return new Date(Date.now() + ACCOUNT_DELETION_TOKEN_TTL_MS).toISOString();
}

async function collectOwnerDeletionData(ownerUserId: string): Promise<OwnerDeletionData> {
  const [sharedUsers, ownedBoards, ownerSettings] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.ownerUserId, ownerUserId)),
    db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId)),
    db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.ownerUserId, ownerUserId)),
  ]);

  const boardIds = ownedBoards.map((board) => board.id);

  const [ownedMedia, ownedMessages] = await Promise.all([
    boardIds.length > 0
      ? db
          .select({ filePath: mediaItems.filePath })
          .from(mediaItems)
          .where(inArray(mediaItems.boardId, boardIds))
      : Promise.resolve([]),
    boardIds.length > 0
      ? db
          .select({ id: messages.id })
          .from(messages)
          .where(inArray(messages.boardId, boardIds))
      : Promise.resolve([]),
  ]);

  return {
    sharedUserIds: sharedUsers.map((user) => user.id),
    boardIds,
    mediaFilePaths: ownedMedia.map((item) => item.filePath),
    summary: {
      userCount: sharedUsers.length + 1,
      sharedUserCount: sharedUsers.length,
      boardCount: boardIds.length,
      mediaCount: ownedMedia.length,
      messageCount: ownedMessages.length,
      settingCount: ownerSettings.length,
      preferenceCount: sharedUsers.length + 1,
    },
  };
}

export async function getOwnerAccountDeletionSummary(
  ownerUserId: string,
): Promise<AccountDeletionSummary> {
  const { summary } = await collectOwnerDeletionData(ownerUserId);
  return summary;
}

export async function deleteOwnerAccount(params: {
  ownerUserId: string;
  deletionRequestId: string;
  ownerUser: OwnerUserForDeletion;
}) {
  const [deletionData, subscription] = await Promise.all([
    collectOwnerDeletionData(params.ownerUserId),
    db.query.ownerSubscriptions.findFirst({
      where: eq(ownerSubscriptions.ownerUserId, params.ownerUserId),
    }),
  ]);
  const now = new Date().toISOString();
  let canceledAt = subscription?.canceledAt ?? null;
  const { billingMode } = getBillingConfig();
  const shouldCancelStripe =
    billingMode === "stripe"
    && subscription?.billingMode === "stripe"
    && subscription.stripeSubscriptionId
    && STRIPE_CANCELABLE_SUBSCRIPTION_STATUSES.has(subscription.status);

  if (shouldCancelStripe && subscription?.stripeSubscriptionId) {
    const canceled = await cancelStripeSubscriptionImmediately({
      ownerUserId: params.ownerUserId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
    canceledAt = canceled.canceledAt;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, params.deletionRequestId));

    if (subscription) {
      await tx
        .update(ownerSubscriptions)
        .set({
          planCode: "free",
          billingInterval: null,
          status: "canceled",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: canceledAt ?? now,
          deletedOwnerAt: now,
          pendingPlanCode: null,
          pendingBillingInterval: null,
          pendingPlanEffectiveAt: null,
          pendingActiveBoardIds: null,
          updatedAt: now,
        })
        .where(eq(ownerSubscriptions.ownerUserId, params.ownerUserId));

      await tx.insert(deletedOwnerBillingRecords).values({
        ownerUserId: params.ownerUserId,
        email: params.ownerUser.email,
        billingMode: subscription.billingMode,
        planCode: subscription.planCode,
        billingInterval: subscription.billingInterval,
        status: "canceled",
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        canceledAt: canceledAt ?? now,
        deletedOwnerAt: now,
      });
    }

    if (deletionData.sharedUserIds.length > 0) {
      await tx
        .delete(users)
        .where(inArray(users.id, deletionData.sharedUserIds));
    }

    await tx.delete(users).where(eq(users.id, params.ownerUserId));
  });

  for (const filePath of deletionData.mediaFilePaths) {
    try {
      await deleteStoredObject(storageKeyFromPublicPath(filePath));
    } catch (error) {
      console.error("[account-deletion] Failed to delete media file", {
        filePath,
        error,
      });
    }

    try {
      await deleteStoredObject(thumbnailStorageKeyFromPublicPath(filePath));
    } catch (error) {
      console.error("[account-deletion] Failed to delete thumbnail", {
        filePath,
        error,
      });
    }
  }

  return deletionData.summary;
}
