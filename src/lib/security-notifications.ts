// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit-log";
import {
  formatDateTime,
  resolvePreferredLocale,
  translate,
  type MessageKey,
  type SupportedLocale,
} from "@/lib/i18n";
import { isSmtpConfigured, sendPlainTextEmail } from "@/lib/mail";
import { getPlanDefinition, isPlanCode } from "@/lib/plans";
import { serverLog } from "@/lib/server-log";

export type SecurityNotificationType =
  | "password_changed"
  | "password_reset_completed"
  | "email_changed"
  | "passkey_registered"
  | "passkey_deleted"
  | "account_locked"
  | "account_unlocked"
  | "plan_changed"
  | "subscription_cancel_scheduled"
  | "subscription_canceled"
  | "payment_failed"
  | "account_deleted"
  | "stripe_cancel_on_delete_failed"
  | "super_owner_granted";

type NotificationUser = Pick<
  typeof users.$inferSelect,
  "id" | "userId" | "email" | "attribute" | "ownerUserId" | "locale"
>;

type NotificationMetadata = Record<string, string | number | boolean | null | undefined>;

type MailCopy = {
  subject: string;
  lines: string[];
};

const CONTACT_EMAIL = "contact@keinage.com";
const HOME_PAGE_URL = "https://keinage.com";

function resolveLocale(storedLocale?: string | null): SupportedLocale {
  return resolvePreferredLocale({
    storedLocale,
    cookieLocale: null,
    acceptLanguage: null,
  });
}

function metadataString(metadata: NotificationMetadata | undefined, key: string): string | null {
  const value = metadata?.[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function planName(value: string | null): string | null {
  if (!value) return null;
  return isPlanCode(value) ? getPlanDefinition(value).name : value;
}

function formatMaybeDate(value: string | null, locale: SupportedLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date, locale);
}

function appendFooter(locale: SupportedLocale, lines: string[]) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  return [
    ...lines,
    "",
    t("mail.security.footer.sender"),
    t("mail.security.footer.contact", { email: CONTACT_EMAIL }),
    t("mail.security.footer.homePage", { url: HOME_PAGE_URL }),
  ];
}

function simpleMailCopy(
  locale: SupportedLocale,
  subjectKey: MessageKey,
  lineKeys: MessageKey[],
): MailCopy {
  const t = (key: MessageKey) => translate(locale, key);
  return {
    subject: t(subjectKey),
    lines: lineKeys.flatMap((key, index) => (
      index === 0 ? [t(key)] : ["", t(key)]
    )),
  };
}

function buildSecurityNotificationMail(
  type: SecurityNotificationType,
  locale: SupportedLocale,
  metadata?: NotificationMetadata,
): MailCopy {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const oldPlan = planName(metadataString(metadata, "oldPlan"));
  const newPlan = planName(metadataString(metadata, "newPlan"));
  const effectiveAt = formatMaybeDate(metadataString(metadata, "effectiveAt"), locale);
  const unknown = t("mail.security.value.unknown");

  switch (type) {
    case "password_changed":
      return simpleMailCopy(locale, "mail.security.passwordChanged.subject", [
        "mail.security.passwordChanged.body",
        "mail.security.passwordChanged.action",
      ]);
    case "password_reset_completed":
      return simpleMailCopy(locale, "mail.security.passwordResetCompleted.subject", [
        "mail.security.passwordResetCompleted.body",
        "mail.security.passwordResetCompleted.action",
      ]);
    case "email_changed":
      return simpleMailCopy(locale, "mail.security.emailChanged.subject", [
        "mail.security.emailChanged.body",
        "mail.security.emailChanged.action",
      ]);
    case "passkey_registered":
      return simpleMailCopy(locale, "mail.security.passkeyRegistered.subject", [
        "mail.security.passkeyRegistered.body",
        "mail.security.passkeyRegistered.action",
      ]);
    case "passkey_deleted":
      return simpleMailCopy(locale, "mail.security.passkeyDeleted.subject", [
        "mail.security.passkeyDeleted.body",
        "mail.security.passkeyDeleted.action",
      ]);
    case "account_locked":
      return simpleMailCopy(locale, "mail.security.accountLocked.subject", [
        "mail.security.accountLocked.body",
        "mail.security.accountLocked.action",
      ]);
    case "account_unlocked":
      return simpleMailCopy(locale, "mail.security.accountUnlocked.subject", [
        "mail.security.accountUnlocked.body",
        "mail.security.accountUnlocked.action",
      ]);
    case "plan_changed":
      return {
        subject: t("mail.security.planChanged.subject"),
        lines: [
          t("mail.security.planChanged.body"),
          "",
          t("mail.security.planChanged.oldPlan", { plan: oldPlan ?? unknown }),
          t("mail.security.planChanged.newPlan", { plan: newPlan ?? unknown }),
          t("mail.security.planChanged.effectiveAt", {
            value: effectiveAt ?? t("mail.security.value.immediate"),
          }),
          "",
          t("mail.security.planChanged.action"),
        ],
      };
    case "subscription_cancel_scheduled":
      return {
        subject: t("mail.security.subscriptionCancelScheduled.subject"),
        lines: [
          t("mail.security.subscriptionCancelScheduled.body"),
          "",
          t("mail.security.subscriptionCancelScheduled.effectiveAt", {
            value: effectiveAt ?? t("mail.security.value.notSet"),
          }),
          "",
          t("mail.security.subscriptionCancelScheduled.action"),
        ],
      };
    case "subscription_canceled":
      return simpleMailCopy(locale, "mail.security.subscriptionCanceled.subject", [
        "mail.security.subscriptionCanceled.body",
        "mail.security.subscriptionCanceled.action",
      ]);
    case "payment_failed":
      return simpleMailCopy(locale, "mail.security.paymentFailed.subject", [
        "mail.security.paymentFailed.body",
        "mail.security.paymentFailed.action",
      ]);
    case "account_deleted":
      return {
        subject: t("mail.security.accountDeleted.subject"),
        lines: [
          t("mail.security.accountDeleted.body"),
          "",
          t("mail.security.accountDeleted.subscription"),
          t("mail.security.accountDeleted.data"),
        ],
      };
    case "stripe_cancel_on_delete_failed":
      return simpleMailCopy(locale, "mail.security.stripeCancelOnDeleteFailed.subject", [
        "mail.security.stripeCancelOnDeleteFailed.body",
        "mail.security.stripeCancelOnDeleteFailed.action",
      ]);
    case "super_owner_granted":
      return simpleMailCopy(locale, "mail.security.superOwnerGranted.subject", [
        "mail.security.superOwnerGranted.body",
        "mail.security.superOwnerGranted.action",
      ]);
  }
}

async function loadNotificationUser(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

async function resolveRecipient(input: {
  user: NotificationUser | null;
  recipientEmail?: string | null;
  recipientLocale?: string | null;
}) {
  if (input.recipientEmail) {
    return {
      email: input.recipientEmail,
      locale: resolveLocale(input.recipientLocale ?? input.user?.locale),
      ownerUserId: input.user?.ownerUserId ?? input.user?.id ?? null,
    };
  }

  if (!input.user) return null;
  if (!input.user.ownerUserId) {
    return {
      email: input.user.email,
      locale: resolveLocale(input.user.locale),
      ownerUserId: input.user.id,
    };
  }

  const owner = await db.query.users.findFirst({
    where: eq(users.id, input.user.ownerUserId),
  });
  if (!owner) return null;
  return {
    email: owner.email,
    locale: resolveLocale(owner.locale),
    ownerUserId: owner.id,
  };
}

export async function sendSecurityNotification(input: {
  type: SecurityNotificationType;
  userId?: string | null;
  user?: NotificationUser | null;
  recipientEmail?: string | null;
  recipientLocale?: string | null;
  request?: NextRequest | Request | null;
  metadata?: NotificationMetadata;
}) {
  const user = input.user ?? (input.userId ? (await loadNotificationUser(input.userId) ?? null) : null);
  const recipient = await resolveRecipient({
    user,
    recipientEmail: input.recipientEmail,
    recipientLocale: input.recipientLocale,
  });
  const auditMetadata = {
    notificationType: input.type,
    recipientOwnerUserId: recipient?.ownerUserId ?? null,
    ...(input.metadata ?? {}),
  };

  if (!recipient) {
    await writeAuditLog({
      actorType: "system",
      action: "security_notification",
      targetType: "user",
      targetId: user?.id ?? input.userId ?? null,
      result: "skipped",
      reason: "recipient_not_found",
      request: input.request,
      metadata: auditMetadata,
    });
    return false;
  }

  if (!isSmtpConfigured()) {
    await writeAuditLog({
      actorType: "system",
      action: "security_notification",
      targetType: "user",
      targetId: user?.id ?? input.userId ?? recipient.ownerUserId,
      result: "skipped",
      reason: "smtp_not_configured",
      request: input.request,
      metadata: auditMetadata,
    });
    serverLog("info", "security-notification", "mail_skipped", auditMetadata);
    return false;
  }

  try {
    const copy = buildSecurityNotificationMail(input.type, recipient.locale, input.metadata);
    const sent = await sendPlainTextEmail({
      to: recipient.email,
      subject: copy.subject,
      lines: appendFooter(recipient.locale, copy.lines),
    });

    await writeAuditLog({
      actorType: "system",
      action: "security_notification",
      targetType: "user",
      targetId: user?.id ?? input.userId ?? recipient.ownerUserId,
      result: sent ? "success" : "failure",
      reason: sent ? null : "mail_send_failed",
      request: input.request,
      metadata: auditMetadata,
    });
    return sent;
  } catch (error) {
    serverLog("error", "security-notification", "mail_failed", {
      ...auditMetadata,
      error,
    });
    await writeAuditLog({
      actorType: "system",
      action: "security_notification",
      targetType: "user",
      targetId: user?.id ?? input.userId ?? recipient.ownerUserId,
      result: "failure",
      reason: "mail_send_failed",
      request: input.request,
      metadata: auditMetadata,
    });
    return false;
  }
}
