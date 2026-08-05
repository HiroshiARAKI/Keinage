// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import SignupRequestClient from "./SignupRequestClient";
import { isGoogleAuthEnabled } from "@/lib/google-auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getOwnerSignupMode, isOwnerSignupEnabled } from "@/lib/signup";

export const dynamic = "force-dynamic";

const SIGNUP_ERROR_MESSAGES: Record<string, string> = {
  "user-already-exists": "登録済みのユーザーがあります。ログインしてください。",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (!isOwnerSignupEnabled()) {
    redirect("/pin/login");
  }
  if (
    getOwnerSignupMode() === "super-owner-only" &&
    await db.query.users.findFirst()
  ) {
    redirect("/pin/login");
  }
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const initialError = errorCode
    ? SIGNUP_ERROR_MESSAGES[errorCode] ?? "登録に失敗しました。時間を置いて再度お試しください。"
    : null;

  return (
    <SignupRequestClient
      googleAuthEnabled={isGoogleAuthEnabled()}
      initialError={initialError}
    />
  );
}
