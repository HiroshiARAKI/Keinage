// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { KeinageLogo } from "@/components/KeinageLogo";

export default function PasswordForgotClient() {
  const { t } = useLocale();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!identifier.trim()) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("auth.passwordForgot.failed"));
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <KeinageLogo className="h-12 w-auto text-gray-900" />
          <h1 className="text-xl font-bold text-gray-900">Keinage</h1>
        </div>

        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Mail className="size-8 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-900">{t("auth.passwordForgot.title")}</h2>
            <p className="text-center text-sm text-gray-500">
              {t("auth.passwordForgot.subtitle")}
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t("auth.passwordForgot.identifierLabel")}
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={t("auth.passwordForgot.identifierPlaceholder")}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {error && <p className="text-center text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
              >
                {submitting ? t("auth.passwordForgot.submitting") : t("auth.passwordForgot.submit")}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-sm text-gray-600">
                {t("auth.passwordForgot.success")}
                <br />
                <span className="text-xs text-gray-400">
                  {t("auth.passwordForgot.successNote")}
                </span>
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/pin/login" className="text-sm text-gray-500 hover:text-blue-600">
              {t("auth.passwordForgot.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}