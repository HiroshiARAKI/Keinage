// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { KeinageLogo } from "@/components/KeinageLogo";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function PasskeyClient({
  mode,
  redirectTo,
}: {
  mode: "register" | "authenticate";
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (working) return;
    setWorking(true);
    setError(null);

    try {
      if (mode === "register") {
        const optionsResponse = await fetch("/api/auth/webauthn/register/start", {
          method: "POST",
        });
        const options = await optionsResponse.json();
        if (!optionsResponse.ok) {
          throw new Error(options.error ?? t("auth.passkey.registerFailed"));
        }

        const credential = await startRegistration({ optionsJSON: options });
        const finishResponse = await fetch("/api/auth/webauthn/register/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credential),
        });
        const finish = await finishResponse.json().catch(() => ({}));
        if (!finishResponse.ok) {
          throw new Error(finish.error ?? t("auth.passkey.registerFailed"));
        }
      } else {
        const optionsResponse = await fetch("/api/auth/webauthn/authenticate/start", {
          method: "POST",
        });
        const options = await optionsResponse.json();
        if (!optionsResponse.ok) {
          if (options.requiresRegistration) {
            router.push("/passkey/setup");
            return;
          }
          throw new Error(options.error ?? t("auth.passkey.authFailed"));
        }

        const credential = await startAuthentication({ optionsJSON: options });
        const finishResponse = await fetch("/api/auth/webauthn/authenticate/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credential),
        });
        const finish = await finishResponse.json().catch(() => ({}));
        if (!finishResponse.ok) {
          throw new Error(finish.error ?? t("auth.passkey.authFailed"));
        }
      }

      router.push(redirectTo || "/boards");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.passkey.authFailed"));
    } finally {
      setWorking(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <KeinageLogo className="h-12 w-auto text-gray-900" />
          <h1 className="text-xl font-bold text-gray-900">Keinage</h1>
        </div>

        <div className="rounded-2xl border bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Fingerprint className="size-10 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">
              {isRegister ? t("auth.passkey.registerTitle") : t("auth.passkey.verifyTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-gray-500">
              {isRegister
                ? t("auth.passkey.registerDescription")
                : t("auth.passkey.verifyDescription")}
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-center text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="button" className="w-full" onClick={run} disabled={working}>
            {working
              ? t("common.loading")
              : isRegister
                ? t("auth.passkey.registerButton")
                : t("auth.passkey.verifyButton")}
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-gray-400">
            {t("auth.passkey.browserHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
