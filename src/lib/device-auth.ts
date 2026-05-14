// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deviceAuthGrants } from "@/db/schema";
import {
  LAST_USER_COOKIE,
  buildAuthCookieOptions,
  buildExpiredAuthCookieOptions,
} from "@/lib/auth";

export const DEVICE_AUTH_COOKIE = "device-auth";
export const DEVICE_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function hashDeviceAuthToken(deviceToken: string): string {
  return createHash("sha256")
    .update(`keinage-device-auth:${deviceToken}`)
    .digest("hex");
}

export function generateDeviceAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export async function getDeviceAuthGrantByToken(deviceToken?: string | null) {
  if (!deviceToken) {
    return null;
  }

  return db.query.deviceAuthGrants.findFirst({
    where: eq(deviceAuthGrants.deviceTokenHash, hashDeviceAuthToken(deviceToken)),
    with: { user: true },
  });
}

export async function storeDeviceFullAuth(params: {
  deviceToken?: string | null;
  userId: string;
  authenticatedAt?: string;
}) {
  const deviceToken = params.deviceToken ?? generateDeviceAuthToken();
  const lastFullAuthAt = params.authenticatedAt ?? new Date().toISOString();
  const deviceTokenHash = hashDeviceAuthToken(deviceToken);

  const existingGrant = await db.query.deviceAuthGrants.findFirst({
    where: eq(deviceAuthGrants.deviceTokenHash, deviceTokenHash),
  });

  if (existingGrant) {
    await db
      .update(deviceAuthGrants)
      .set({ userId: params.userId, lastFullAuthAt })
      .where(eq(deviceAuthGrants.id, existingGrant.id));
  } else {
    await db.insert(deviceAuthGrants).values({
      userId: params.userId,
      deviceTokenHash,
      lastFullAuthAt,
    });
  }

  return { deviceToken, lastFullAuthAt };
}

export function setDeviceAuthCookie(
  response: NextResponse,
  deviceToken: string,
  request?: Request,
) {
  response.cookies.set(
    DEVICE_AUTH_COOKIE,
    deviceToken,
    buildAuthCookieOptions(DEVICE_AUTH_COOKIE_MAX_AGE, request),
  );
}

export function clearDeviceAuthCookie(response: NextResponse, request?: Request) {
  response.cookies.set(DEVICE_AUTH_COOKIE, "", buildExpiredAuthCookieOptions(request));
}

export function clearLegacyLastUserCookie(response: NextResponse, request?: Request) {
  response.cookies.set(LAST_USER_COOKIE, "", buildExpiredAuthCookieOptions(request));
}
