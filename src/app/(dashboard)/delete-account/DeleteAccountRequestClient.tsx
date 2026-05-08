// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, MailWarning } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { AccountDeletionSummary } from "@/lib/account-deletion";

type DeleteAccountRequestClientProps = {
  email: string;
  summary: AccountDeletionSummary;
  planName: string;
  hasPaidSubscription: boolean;
};

export default function DeleteAccountRequestClient({
  email,
  summary,
  planName,
  hasPaidSubscription,
}: DeleteAccountRequestClientProps) {
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");

  async function handleRequest() {
    if (confirmation !== "DELETE") {
      setError(t("accountDeletion.confirmationMismatch"));
      return;
    }

    const confirmed = window.confirm(
      t("accountDeletion.sendConfirm"),
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setPreviewUrl(null);

    try {
      const response = await fetch("/api/auth/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? t("accountDeletion.sendFailed"));
        return;
      }

      setSuccess(t("accountDeletion.sendSuccess", { email }));
      setPreviewUrl(typeof data.previewUrl === "string" ? data.previewUrl : null);
    } catch {
      setError(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  }

  const items = [
    { label: t("accountDeletion.ownerAccount"), value: t("accountDeletion.count", { count: 1 }) },
    { label: t("accountDeletion.sharedUsers"), value: t("accountDeletion.count", { count: summary.sharedUserCount }) },
    { label: t("accountDeletion.boards"), value: t("accountDeletion.count", { count: summary.boardCount }) },
    { label: t("accountDeletion.media"), value: t("accountDeletion.count", { count: summary.mediaCount }) },
    { label: t("accountDeletion.messages"), value: t("accountDeletion.count", { count: summary.messageCount }) },
    { label: t("accountDeletion.settings"), value: t("accountDeletion.count", { count: summary.settingCount }) },
    { label: t("accountDeletion.preferences"), value: t("accountDeletion.count", { count: summary.preferenceCount }) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t("accountDeletion.requestEyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">{t("accountDeletion.requestTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("accountDeletion.requestIntro")}
        </p>
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-red-600" />
          <div className="space-y-2 text-sm text-red-950">
            <p className="font-semibold">{t("accountDeletion.irreversible")}</p>
            <p>
              {t("accountDeletion.requestWarning", { email })}
            </p>
            {hasPaidSubscription ? (
              <>
                <p>{t("accountDeletion.paidPlanNotice", { planName })}</p>
                <p>{t("accountDeletion.paidCancellationNotice")}</p>
                <p>{t("accountDeletion.noRefundNotice")}</p>
              </>
            ) : (
              <p>{t("accountDeletion.freePlanNotice")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-6">
        <h2 className="text-lg font-semibold">{t("accountDeletion.itemsTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("accountDeletion.itemsDescription")}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-3 text-sm text-muted-foreground">
          {t("accountDeletion.sessionNote")}
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-6">
        <label className="block text-sm font-semibold text-foreground" htmlFor="delete-confirmation">
          {t("accountDeletion.confirmationLabel")}
        </label>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("accountDeletion.confirmationDescription")}
        </p>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-4 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-red-500"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRequest}
          disabled={submitting || confirmation !== "DELETE"}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          <MailWarning className="size-4" />
          {submitting ? t("accountDeletion.sending") : t("accountDeletion.sendButton")}
        </button>
        <Link
          href="/settings"
          className="inline-flex rounded-lg border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t("accountDeletion.backToSettings")}
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>{success}</p>
          {previewUrl && (
            <p className="mt-2">
              {t("accountDeletion.preview")}: <a href={previewUrl} className="underline">{previewUrl}</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
