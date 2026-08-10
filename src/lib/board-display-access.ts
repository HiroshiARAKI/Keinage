// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const BOARD_DISPLAY_ACCESS_QUERY_PARAM = "displayDeviceKey";
export const BOARD_DISPLAY_DEVICE_STORAGE_KEY = "keinage-display-device-key";
export const BOARD_DISPLAY_DEVICE_COOKIE = "keinage-display-device-key";
const BOARD_DISPLAY_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function createBoardDisplayDeviceKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function persistBoardDisplayDeviceCookie(deviceKey: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${BOARD_DISPLAY_DEVICE_COOKIE}=${encodeURIComponent(deviceKey)}; Path=/; Max-Age=${BOARD_DISPLAY_DEVICE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function getOrCreateBoardDisplayDeviceKey() {
  let deviceKey: string;
  try {
    const existing = window.localStorage.getItem(
      BOARD_DISPLAY_DEVICE_STORAGE_KEY,
    );
    if (existing) {
      deviceKey = existing;
    } else {
      deviceKey = createBoardDisplayDeviceKey();
      window.localStorage.setItem(BOARD_DISPLAY_DEVICE_STORAGE_KEY, deviceKey);
    }
  } catch {
    deviceKey = createBoardDisplayDeviceKey();
  }

  try {
    persistBoardDisplayDeviceCookie(deviceKey);
  } catch {
    // The query parameter remains available when cookies are blocked.
  }
  return deviceKey;
}

function readCookieValue(cookieHeader: string, name: string) {
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function readBoardDisplayDeviceKeyFromRequest(request: Request) {
  const queryValue = new URL(request.url).searchParams.get(
    BOARD_DISPLAY_ACCESS_QUERY_PARAM,
  );
  if (queryValue) return queryValue;
  return readCookieValue(
    request.headers.get("cookie") ?? "",
    BOARD_DISPLAY_DEVICE_COOKIE,
  );
}

export function withBoardDisplayAccessQuery(
  url: string,
  deviceKey: string | null | undefined,
) {
  if (!deviceKey) return url;

  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const pathAndQuery = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex >= 0
    ? pathAndQuery.slice(0, queryIndex)
    : pathAndQuery;
  const search = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(search);
  params.set(BOARD_DISPLAY_ACCESS_QUERY_PARAM, deviceKey);

  return `${path}?${params.toString()}${hash}`;
}
