// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { AUTH_SESSION_COOKIE } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  countWebAuthnCredentials,
  isWebAuthnEnabled,
  isWebAuthnRequiredForUser,
} from "@/lib/webauthn";
import { sanitizeRedirectTarget } from "@/lib/utils";
import { PasskeyClient } from "@/components/auth/PasskeyClient";

export const dynamic = "force-dynamic";

export default async function PasskeyVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  if (!isWebAuthnEnabled()) {
    redirect("/boards");
  }

  const params = await searchParams;
  const redirectTo = sanitizeRedirectTarget(
    typeof params.redirectTo === "string" ? params.redirectTo : null,
  );
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect("/pin/login");
  }

  const session = await db.query.authSessions.findFirst({
    where: and(
      eq(authSessions.sessionToken, sessionToken),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ),
    with: { user: true },
  });
  if (!session) {
    redirect("/pin/login");
  }
  if (!isOwnerUser(session.user) || !isWebAuthnRequiredForUser(session.user)) {
    redirect(redirectTo || "/boards");
  }
  if (session.webauthnVerified) {
    redirect(redirectTo || "/boards");
  }
  if ((await countWebAuthnCredentials(session.user.id)) === 0) {
    redirect(
      redirectTo
        ? `/passkey/setup?redirectTo=${encodeURIComponent(redirectTo)}`
        : "/passkey/setup",
    );
  }

  return <PasskeyClient mode="authenticate" redirectTo={redirectTo} />;
}
