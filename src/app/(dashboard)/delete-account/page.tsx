// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getOwnerAccountDeletionSummary,
  type AccountDeletionSummary,
} from "@/lib/account-deletion";
import { getEffectivePlanForOwner } from "@/lib/billing";
import { isOwnerUser } from "@/lib/ownership";
import DeleteAccountRequestClient from "./DeleteAccountRequestClient";

export default async function DeleteAccountPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/pin");
  }

  if (!isOwnerUser(session.user)) {
    redirect("/settings");
  }

  const [summary, effectivePlan]: [AccountDeletionSummary, Awaited<ReturnType<typeof getEffectivePlanForOwner>>] =
    await Promise.all([
      getOwnerAccountDeletionSummary(session.user.id),
      getEffectivePlanForOwner(session.user.id),
    ]);
  const hasPaidSubscription =
    effectivePlan.billingMode === "stripe"
    && effectivePlan.subscription?.billingMode === "stripe"
    && effectivePlan.subscription.planCode !== "free"
    && effectivePlan.subscription.status !== "canceled"
    && effectivePlan.subscription.status !== "none";

  return (
    <DeleteAccountRequestClient
      email={session.user.email}
      summary={summary}
      planName={effectivePlan.plan.name}
      hasPaidSubscription={hasPaidSubscription}
    />
  );
}
