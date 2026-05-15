// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { PinInput } from "@/components/auth/PinInput";
import { KeinageLogo } from "@/components/KeinageLogo";
import { isSupportedLocale } from "@/lib/i18n";

export default function PinLoginClient({
  userId,
  redirectTo,
}: {
  userId: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const { t, setLocale } = useLocale();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const handleComplete = useCallback(
    async (value: string) => {
      if (verifying || blocked) return;
      setVerifying(true);
      setError("");

      try {
        const res = await fetch("/api/auth/pin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const data = await res.json();

        console.log("[PinLoginClient] Verify response", { status: res.status, ok: res.ok, data });

        if (!res.ok) {
          if (data.blocked || data.locked) {
            setBlocked(true);
          }
          setError(data.error || t("error.authFailed"));
          setPin("");
          setVerifying(false);
          return;
        }

        if (isSupportedLocale(data.locale)) {
          setLocale(data.locale);
        }

        const nextPath =
          data.redirectTo && redirectTo
            ? `${data.redirectTo}?redirectTo=${encodeURIComponent(redirectTo)}`
            : data.redirectTo || redirectTo || "/boards";
        router.push(nextPath);
      } catch {
        setError(t("error.network"));
        setPin("");
        setVerifying(false);
      }
    },
    [router, redirectTo, verifying, blocked, t, setLocale],
  );

  const accountLoginHref = redirectTo
    ? `/pin/login?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/pin/login";

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
            <Lock className="size-8 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-900">
              {t("auth.pin.title")}
            </h2>
            <p className="text-center text-sm text-gray-500">
              {t("auth.pin.subtitle", { userId })}
            </p>
          </div>

          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={handleComplete}
            disabled={verifying || blocked}
            error={!!error}
          />

          {verifying && !error && (
            <p className="mt-3 text-center text-sm text-gray-500">
              {t("auth.pin.verifying")}
            </p>
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-red-600">{error}</p>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href={accountLoginHref}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {t("auth.pin.loginWithAccount")}
            </Link>
            <Link
              href="/pin/forgot"
              className="text-sm text-gray-500 hover:text-blue-600"
            >
              {t("auth.pin.forgot")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
