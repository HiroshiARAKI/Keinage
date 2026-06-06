// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sharedSignupRequests } from "@/db/schema";
import { isGoogleAuthEnabled } from "@/lib/google-auth";
import SharedSignupClient from "./SharedSignupClient";

export const dynamic = "force-dynamic";

export default async function SharedSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const now = new Date().toISOString();

  const signupRequest = await db.query.sharedSignupRequests.findFirst({
    where: and(
      eq(sharedSignupRequests.token, token),
      isNull(sharedSignupRequests.completedAt),
      gt(sharedSignupRequests.expiresAt, now),
      eq(sharedSignupRequests.status, "invited"),
    ),
  });

  if (!signupRequest) {
    notFound();
  }

  return (
    <SharedSignupClient
      token={token}
      email={signupRequest.email}
      googleAuthEnabled={isGoogleAuthEnabled()}
    />
  );
}
