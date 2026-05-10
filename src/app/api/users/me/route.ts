// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { isSupportedLocale, LOCALE_COOKIE_NAME, type SupportedLocale } from "@/lib/i18n";
import { isOwnerUser } from "@/lib/ownership";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  isValidOrganizationName,
  normalizeOrganizationName,
} from "@/lib/signup";

/** PATCH /api/users/me — update current user's mutable preferences */
export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const { colorTheme, locale, organizationName } = body as {
    colorTheme?: string;
    locale?: SupportedLocale | null;
    organizationName?: string | null;
  };

  const updates: Partial<typeof users.$inferInsert> = {};

  if (colorTheme !== undefined) {
    if (!["system", "light", "dark"].includes(colorTheme)) {
      return NextResponse.json(
        { error: "colorTheme は 'system' / 'light' / 'dark' のいずれかを指定してください" },
        { status: 400 },
      );
    }
    updates.colorTheme = colorTheme;
  }

  if (locale !== undefined) {
    if (locale !== null && !isSupportedLocale(locale)) {
      return NextResponse.json(
        { error: "locale はサポートされている言語コードを指定してください" },
        { status: 400 },
      );
    }
    updates.locale = locale;
  }

  if (organizationName !== undefined) {
    if (!isOwnerUser(session.user)) {
      return NextResponse.json(
        { error: "組織名を変更できるのはOwnerのみです" },
        { status: 403 },
      );
    }

    const normalizedOrganizationName = normalizeOrganizationName(organizationName);
    if (
      normalizedOrganizationName !== null &&
      !isValidOrganizationName(normalizedOrganizationName)
    ) {
      return NextResponse.json(
        { error: `組織名は${ORGANIZATION_NAME_MAX_LENGTH}文字以内で入力してください` },
        { status: 400 },
      );
    }

    updates.organizationName = normalizedOrganizationName;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, session.userId));
  }

  const response = NextResponse.json({ ok: true });
  if (locale !== undefined) {
    response.cookies.set(LOCALE_COOKIE_NAME, locale ?? "", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: locale ? 60 * 60 * 24 * 365 : 0,
      expires: locale ? undefined : new Date(0),
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
