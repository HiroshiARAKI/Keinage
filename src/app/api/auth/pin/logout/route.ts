// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AUTH_SESSION_COOKIE, buildExpiredAuthCookieOptions } from "@/lib/auth";
import { clearLegacyLastUserCookie } from "@/lib/device-auth";
import { cookies } from "next/headers";

/** POST /api/auth/pin/logout — clear session */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;

  console.log("[logout] Clearing session", { hasToken: !!sessionToken });

  if (sessionToken) {
    await db
      .delete(authSessions)
      .where(eq(authSessions.sessionToken, sessionToken));
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_SESSION_COOKIE, "", buildExpiredAuthCookieOptions(request));
  clearLegacyLastUserCookie(res, request);
  return res;
}
