// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, eq, gt, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";
import { hashOneTimeToken } from "@/lib/account-security";
import PasswordResetClient from "./PasswordResetClient";

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const now = new Date().toISOString();

  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hashOneTimeToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now),
    ),
  });

  if (!resetToken) {
    notFound();
  }

  return <PasswordResetClient token={token} />;
}