// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { KeinageLogo } from "@/components/KeinageLogo";
import { isSupportedLocale } from "@/lib/i18n";

export default function LoginClient({
  redirectTo,
  notice,
  showPinLoginLink,
  googleAuthEnabled,
  initialError,
}: {
  redirectTo?: string | null;
  notice?: "password-reset" | "signup-existing" | null;
  showPinLoginLink: boolean;
  googleAuthEnabled: boolean;
  initialError?: "shared-user-inactive-due-to-plan" | null;
}) {
  const { t, setLocale } = useLocale();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    initialError ? t("auth.login.inactiveDueToPlan") : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting || blocked) return;
      setSubmitting(true);
      setError("");

      try {
        const res = await fetch("/api/auth/credentials/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password }),
        });
        const data = await res.json();

        console.log("[LoginClient] Login response", { status: res.status, ok: res.ok, data });

        if (!res.ok) {
          if (data.blocked || data.locked) setBlocked(true);
          setError(data.error || t("error.authFailed"));
          setPassword("");
          setSubmitting(false);
          return;
        }

        if (isSupportedLocale(data.locale)) {
          setLocale(data.locale);
        }

        const nextPath =
          data.redirectTo && redirectTo
            ? `${data.redirectTo}?redirectTo=${encodeURIComponent(redirectTo)}`
            : data.redirectTo || redirectTo || "/boards";
        window.location.assign(nextPath);
      } catch {
        setError(t("error.network"));
        setPassword("");
        setSubmitting(false);
      }
    },
    [redirectTo, identifier, password, submitting, blocked, t, setLocale],
  );

  const pinLoginHref = redirectTo
    ? `/pin?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/pin";
  const googleLoginHref = redirectTo
    ? `/api/auth/google/start?mode=login&redirectTo=${encodeURIComponent(redirectTo)}`
    : "/api/auth/google/start?mode=login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <KeinageLogo className="h-12 w-auto text-gray-900" />
          <h1 className="text-xl font-bold text-gray-900">Keinage</h1>
        </div>

        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            <KeyRound className="size-8 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-900">{t("auth.login.title")}</h2>
            <p className="text-center text-sm text-gray-500">
              {t("auth.login.subtitle")}
            </p>
          </div>

          {notice === "signup-existing" && (
            <p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center text-sm text-blue-700">
              すでに登録済みのアカウントがあります。ログインしてください。
            </p>
          )}

          {notice === "password-reset" && (
            <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700">
              {t("auth.login.noticePasswordReset")}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="identifier"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                {t("auth.login.identifierLabel")}
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("auth.login.identifierPlaceholder")}
                required
                autoFocus
                disabled={blocked}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                {t("auth.login.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.login.passwordPlaceholder")}
                required
                disabled={blocked}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
              />
            </div>

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || blocked}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
            >
              {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
            </button>
          </form>

          {googleAuthEnabled && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                <span>{t("common.or")}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <GoogleAuthButton href={googleLoginHref}>
                {t("auth.google.login")}
              </GoogleAuthButton>
            </div>
          )}

          <div className="mt-6 space-y-3 text-center">
            {showPinLoginLink && (
              <Link
                href={pinLoginHref}
                className="block text-sm text-gray-500 hover:text-blue-600"
              >
                {t("auth.login.loginWithPin")}
              </Link>
            )}
            <Link
              href="/password/forgot"
              className="block text-sm text-gray-500 hover:text-blue-600"
            >
              {t("auth.login.forgotPassword")}
            </Link>
            <Link
              href="/signup"
              className="block text-sm text-gray-500 hover:text-blue-600"
            >
              アカウントを作成する
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
