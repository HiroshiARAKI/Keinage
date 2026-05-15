// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/audit-log";
import { formatDateTime, resolvePreferredLocale, type SupportedLocale } from "@/lib/i18n";
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
  if (locale === "ja-JP") {
    return [
      ...lines,
      "",
      "Keinage管理者",
      `お問い合わせ: ${CONTACT_EMAIL}`,
      `ホームページ: ${HOME_PAGE_URL}`,
    ];
  }

  return [
    ...lines,
    "",
    "Keinage Administrator",
    `Contact: ${CONTACT_EMAIL}`,
    `Website: ${HOME_PAGE_URL}`,
  ];
}

function buildSecurityNotificationMail(
  type: SecurityNotificationType,
  locale: SupportedLocale,
  metadata?: NotificationMetadata,
): MailCopy {
  const oldPlan = planName(metadataString(metadata, "oldPlan"));
  const newPlan = planName(metadataString(metadata, "newPlan"));
  const effectiveAt = formatMaybeDate(metadataString(metadata, "effectiveAt"), locale);

  if (locale === "ja-JP") {
    switch (type) {
      case "password_changed":
        return {
          subject: "Keinage パスワード変更のお知らせ",
          lines: [
            "Keinageアカウントのパスワードが変更されました。",
            "",
            "この操作に心当たりがない場合は、ただちにパスワードを再設定し、サポートまでお問い合わせください。",
          ],
        };
      case "password_reset_completed":
        return {
          subject: "Keinage パスワード再設定完了のお知らせ",
          lines: [
            "Keinageアカウントのパスワード再設定が完了しました。",
            "",
            "この操作に心当たりがない場合は、ただちにサポートまでお問い合わせください。",
          ],
        };
      case "email_changed":
        return {
          subject: "Keinage メールアドレス変更のお知らせ",
          lines: [
            "Keinageアカウントのメールアドレスが変更されました。",
            "",
            "この操作に心当たりがない場合は、ただちにアカウント設定をご確認ください。",
          ],
        };
      case "passkey_registered":
        return {
          subject: "Keinage Passkey登録のお知らせ",
          lines: [
            "Keinageアカウントに新しいPasskeyが登録されました。",
            "",
            "この操作に心当たりがない場合は、アカウント設定を確認し、不要なPasskeyを削除してください。",
          ],
        };
      case "passkey_deleted":
        return {
          subject: "Keinage Passkey削除のお知らせ",
          lines: [
            "KeinageアカウントからPasskeyが削除されました。",
            "",
            "この操作に心当たりがない場合は、ただちにアカウント設定をご確認ください。",
          ],
        };
      case "account_locked":
        return {
          subject: "Keinage アカウントロックのお知らせ",
          lines: [
            "ログイン失敗が続いたため、Keinageアカウントが一時的にロックされました。",
            "",
            "この操作に心当たりがない場合は、サポートまでお問い合わせください。",
          ],
        };
      case "account_unlocked":
        return {
          subject: "Keinage アカウントロック解除のお知らせ",
          lines: [
            "Keinageアカウントのロックが解除されました。",
            "",
            "この操作に心当たりがない場合は、サポートまでお問い合わせください。",
          ],
        };
      case "plan_changed":
        return {
          subject: "Keinage プラン変更のお知らせ",
          lines: [
            "Keinageのプランが変更されました。",
            "",
            `変更前: ${oldPlan ?? "不明"}`,
            `変更後: ${newPlan ?? "不明"}`,
            `適用日時: ${effectiveAt ?? "即時"}`,
            "",
            "この操作に心当たりがない場合は、サポートまでお問い合わせください。",
          ],
        };
      case "subscription_cancel_scheduled":
        return {
          subject: "Keinage サブスクリプション解約予約のお知らせ",
          lines: [
            "Keinageのサブスクリプション解約が予約されました。",
            "",
            `解約予定日時: ${effectiveAt ?? "未定"}`,
            "",
            "この操作に心当たりがない場合は、サポートまでお問い合わせください。",
          ],
        };
      case "subscription_canceled":
        return {
          subject: "Keinage サブスクリプション解約完了のお知らせ",
          lines: [
            "Keinageのサブスクリプションが解約されました。",
            "",
            "この操作に心当たりがない場合は、サポートまでお問い合わせください。",
          ],
        };
      case "payment_failed":
        return {
          subject: "Keinage お支払いに失敗しました",
          lines: [
            "Keinageのサブスクリプション料金のお支払いに失敗しました。",
            "",
            "サービスの利用を継続するには、支払い方法をご確認ください。",
          ],
        };
      case "account_deleted":
        return {
          subject: "Keinage 退会完了のお知らせ",
          lines: [
            "Keinageの退会処理が完了しました。",
            "",
            "有料プランをご利用中だった場合、サブスクリプションは即時キャンセルされています。",
            "退会後、作成済みボードやアップロード済みメディアは利用できません。",
          ],
        };
      case "stripe_cancel_on_delete_failed":
        return {
          subject: "Keinage 退会時のサブスクリプション解約失敗のお知らせ",
          lines: [
            "退会処理中にStripeサブスクリプションのキャンセルに失敗しました。",
            "",
            "退会処理は完了していません。サポートまでお問い合わせください。",
          ],
        };
      case "super_owner_granted":
        return {
          subject: "Keinage Super Owner付与のお知らせ",
          lines: [
            "KeinageアカウントにSuper Owner権限が付与されました。",
            "",
            "この操作に心当たりがない場合は、ただちにサポートまでお問い合わせください。",
          ],
        };
    }
  }

  switch (type) {
    case "password_changed":
      return {
        subject: "Keinage password changed",
        lines: [
          "The password for your Keinage account has been changed.",
          "",
          "If you did not perform this action, reset your password immediately and contact support.",
        ],
      };
    case "password_reset_completed":
      return {
        subject: "Keinage password reset completed",
        lines: [
          "The password reset for your Keinage account has been completed.",
          "",
          "If you did not perform this action, contact support immediately.",
        ],
      };
    case "email_changed":
      return {
        subject: "Keinage email address changed",
        lines: [
          "The email address for your Keinage account has been changed.",
          "",
          "If you did not perform this action, review your account settings immediately.",
        ],
      };
    case "passkey_registered":
      return {
        subject: "Keinage passkey registered",
        lines: [
          "A new passkey has been registered for your Keinage account.",
          "",
          "If you did not perform this action, review your account settings and delete unknown passkeys.",
        ],
      };
    case "passkey_deleted":
      return {
        subject: "Keinage passkey deleted",
        lines: [
          "A passkey has been deleted from your Keinage account.",
          "",
          "If you did not perform this action, review your account settings immediately.",
        ],
      };
    case "account_locked":
      return {
        subject: "Keinage account locked",
        lines: [
          "Your Keinage account has been temporarily locked due to repeated sign-in failures.",
          "",
          "If you did not perform this action, contact support.",
        ],
      };
    case "account_unlocked":
      return {
        subject: "Keinage account unlocked",
        lines: [
          "Your Keinage account has been unlocked.",
          "",
          "If you did not perform this action, contact support.",
        ],
      };
    case "plan_changed":
      return {
        subject: "Keinage plan changed",
        lines: [
          "Your Keinage plan has been changed.",
          "",
          `Previous plan: ${oldPlan ?? "Unknown"}`,
          `New plan: ${newPlan ?? "Unknown"}`,
          `Effective at: ${effectiveAt ?? "Immediately"}`,
          "",
          "If you did not perform this action, contact support.",
        ],
      };
    case "subscription_cancel_scheduled":
      return {
        subject: "Keinage subscription cancellation scheduled",
        lines: [
          "A cancellation has been scheduled for your Keinage subscription.",
          "",
          `Scheduled cancellation: ${effectiveAt ?? "Not set"}`,
          "",
          "If you did not perform this action, contact support.",
        ],
      };
    case "subscription_canceled":
      return {
        subject: "Keinage subscription canceled",
        lines: [
          "Your Keinage subscription has been canceled.",
          "",
          "If you did not perform this action, contact support.",
        ],
      };
    case "payment_failed":
      return {
        subject: "Keinage payment failed",
        lines: [
          "A payment for your Keinage subscription has failed.",
          "",
          "To keep using the service, please review your payment method.",
        ],
      };
    case "account_deleted":
      return {
        subject: "Keinage account deleted",
        lines: [
          "Your Keinage account deletion has been completed.",
          "",
          "If you had a paid plan, the subscription has been canceled immediately.",
          "After deletion, your boards and uploaded media are no longer available.",
        ],
      };
    case "stripe_cancel_on_delete_failed":
      return {
        subject: "Keinage subscription cancellation failed during account deletion",
        lines: [
          "Stripe subscription cancellation failed during account deletion.",
          "",
          "The account deletion has not been completed. Please contact support.",
        ],
      };
    case "super_owner_granted":
      return {
        subject: "Keinage Super Owner granted",
        lines: [
          "Super Owner permission has been granted to your Keinage account.",
          "",
          "If you did not perform this action, contact support immediately.",
        ],
      };
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
