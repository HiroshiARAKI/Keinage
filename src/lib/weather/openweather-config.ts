// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOwnerSetting } from "@/lib/owner-settings";

export const OPENWEATHER_API_KEY_SETTING = "openWeatherApiKey";

export async function getOpenWeatherApiKey(): Promise<string | null> {
  const superOwner = await db.query.users.findFirst({
    where: eq(users.isSuperOwner, true),
    columns: { id: true },
  });
  if (superOwner) {
    const stored = await getOwnerSetting(
      superOwner.id,
      OPENWEATHER_API_KEY_SETTING,
    );
    if (stored?.trim()) return stored.trim();
  }

  return process.env.OPENWEATHER_API_KEY?.trim() || null;
}
