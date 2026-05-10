// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailPlus } from "lucide-react";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { KeinageLogo } from "@/components/KeinageLogo";

export default function SignupRequestClient({
  googleAuthEnabled,
  initialError,
}: {
  googleAuthEnabled: boolean;
  initialError?: string | null;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [submitting, setSubmitting] = useState(false);
  const normalizedOrganizationName = organizationName.trim();
  const googleSignupHref = normalizedOrganizationName
    ? `/api/auth/google/start?mode=owner-signup&organizationName=${encodeURIComponent(normalizedOrganizationName)}`
    : "/api/auth/google/start?mode=owner-signup";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/credentials/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          email: email.trim(),
          phoneNumber: phoneNumber.trim(),
          organizationName: normalizedOrganizationName,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.code === "user_exists") {
          router.push("/pin/login?notice=signup-existing");
          return;
        }
        setError(data.error || t("auth.signupRequest.failed"));
        return;
      }

      router.push("/signingup");
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
            <MailPlus className="size-8 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">{t("auth.signupRequest.title")}</h2>
            <p className="text-center text-sm text-gray-500">{t("auth.signupRequest.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="userId" className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("common.userId")}
              </label>
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="admin"
                required
                autoFocus
                pattern="[a-zA-Z0-9_\-]{3,32}"
                title={t("users.userIdHint")}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("auth.signupRequest.userIdHint")}
              </p>
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("common.email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label htmlFor="phoneNumber" className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("auth.signupRequest.phoneLabel")}
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="090-1234-5678"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("auth.signupRequest.phoneHint")}
              </p>
            </div>

            <div>
              <label htmlFor="organizationName" className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("auth.signupRequest.organizationNameLabel")}
              </label>
              <input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder={t("auth.signupRequest.organizationNamePlaceholder")}
                maxLength={120}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("auth.signupRequest.organizationNameHint")}
              </p>
            </div>

            {error && <p className="text-center text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
            >
              {submitting ? t("auth.signupRequest.submitting") : t("auth.signupRequest.submit")}
            </button>
          </form>

          {googleAuthEnabled && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                <span>{t("common.or")}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <GoogleAuthButton href={googleSignupHref}>
                {t("auth.google.signup")}
              </GoogleAuthButton>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              href="/pin/login"
              className="text-sm text-gray-500 hover:text-blue-600"
            >
              すでにアカウントをお持ちの方はログイン
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
