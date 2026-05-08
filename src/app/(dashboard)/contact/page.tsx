// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePlanForUser } from "@/lib/billing";
import { isContactSmtpConfigured } from "@/lib/contact";
import { ContactForm, ExternalSupportLinks } from "@/components/dashboard/ContactClient";

const PAID_PLAN_CODES = new Set(["lite", "standard", "standard_plus"]);

export default async function ContactPage() {
  const session = await getSessionUser();
  if (!session) redirect("/pin");

  const effectivePlan = await getEffectivePlanForUser(session.user);
  const planCode = effectivePlan.plan.code;
  const smtpConfigured = isContactSmtpConfigured();
  const isPaidPlan = PAID_PLAN_CODES.has(planCode);
  const isFreePlan = planCode === "free";
  const showForm = isPaidPlan && smtpConfigured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">問い合わせ</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keinage に関する相談や不具合報告を送信できます。個人運営のため、返信まで 1 週間程度かかる場合があります。
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">現在のプラン</span>
          <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
            {effectivePlan.plan.name}
          </span>
        </div>

        {showForm ? (
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              Owner 情報、現在のプラン、送信ユーザー情報はサーバー側で自動付与されます。
            </p>
            <ContactForm />
          </>
        ) : isFreePlan ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Free プランの問い合わせ</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Free プランでは GitHub Issues を利用できます。フォームでの問い合わせが必要な場合は Lite 以上をご検討ください。
              </p>
            </div>
            <ExternalSupportLinks showUpgrade />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">問い合わせフォームは利用できません</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Self-hosted / unlimited 環境、または問い合わせ用 SMTP が未設定の環境では GitHub Issues / Discussions を利用してください。
              </p>
            </div>
            {isPaidPlan && !smtpConfigured && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                CONTACT_SMTP_* と CONTACT_TO_EMAIL が未設定のため、フォーム送信は無効です。
              </p>
            )}
            <ExternalSupportLinks />
          </div>
        )}
      </div>
    </div>
  );
}
