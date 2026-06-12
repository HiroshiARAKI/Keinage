// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

const SENSITIVE_SETTING_KEYS = new Set(["openWeatherApiKey"]);

export async function getOwnerSetting(
  ownerUserId: string,
  key: string,
): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: and(
      eq(settings.ownerUserId, ownerUserId),
      eq(settings.key, key),
    ),
  });
  return row?.value ?? null;
}

export async function listOwnerSettings(
  ownerUserId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.ownerUserId, ownerUserId));

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (SENSITIVE_SETTING_KEYS.has(row.key)) continue;
    result[row.key] = row.value;
  }
  return result;
}

export async function upsertOwnerSettings(
  ownerUserId: string,
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    const existing = await db
      .select()
      .from(settings)
      .where(
        and(
          eq(settings.ownerUserId, ownerUserId),
          eq(settings.key, key),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(settings)
        .set({ value })
        .where(
          and(
            eq(settings.ownerUserId, ownerUserId),
            eq(settings.key, key),
          ),
        );
    } else {
      await db.insert(settings).values({ ownerUserId, key, value });
    }
  }
}
