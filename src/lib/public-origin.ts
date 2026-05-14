// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NON_PUBLIC_HOSTNAMES = new Set(["0.0.0.0", "::", "[::]"]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function extractHostHostname(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith("[")) {
    const closingIndex = trimmed.indexOf("]");
    return closingIndex >= 0 ? trimmed.slice(0, closingIndex + 1) : trimmed;
  }

  const colonIndex = trimmed.indexOf(":");
  return colonIndex >= 0 ? trimmed.slice(0, colonIndex) : trimmed;
}

function parseOriginCandidate(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const hostname = normalizeHostname(url.hostname);
    if (NON_PUBLIC_HOSTNAMES.has(hostname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(): string | null {
  const configuredOrigin = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!configuredOrigin) {
    return null;
  }

  try {
    const url = new URL(configuredOrigin);
    const hostname = normalizeHostname(url.hostname);
    if (NON_PUBLIC_HOSTNAMES.has(hostname)) {
      console.error(
        "[public-origin] APP_PUBLIC_ORIGIN must be a browser-accessible origin, not a bind address",
      );
      return null;
    }

    return url.origin;
  } catch {
    console.error("[public-origin] APP_PUBLIC_ORIGIN is invalid");
    return null;
  }
}

export function buildPublicAppUrl(pathname: string): string | null {
  const origin = getPublicAppOrigin();
  if (!origin) {
    return null;
  }

  try {
    return new URL(pathname, `${origin}/`).toString();
  } catch {
    return null;
  }
}

export function buildRequestHeaderAppUrl(request: Request, pathname: string): string | null {
  const originCandidate = parseOriginCandidate(request.headers.get("origin"));
  if (originCandidate) {
    return new URL(pathname, `${originCandidate.origin}/`).toString();
  }

  const refererCandidate = parseOriginCandidate(request.headers.get("referer"));
  if (refererCandidate) {
    return new URL(pathname, `${refererCandidate.origin}/`).toString();
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (!host) {
    return null;
  }

  const hostname = normalizeHostname(extractHostHostname(host));
  if (NON_PUBLIC_HOSTNAMES.has(hostname)) {
    return null;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProtocol = parseOriginCandidate(request.url)?.protocol;
  const protocol = forwardedProto
    ? `${forwardedProto.replace(/:$/, "")}:`
    : requestProtocol
      ?? "http:";

  return new URL(pathname, `${protocol}//${host}/`).toString();
}

export function buildRequestAppUrl(request: Request, pathname: string): string | null {
  const publicUrl = buildPublicAppUrl(pathname);
  if (publicUrl) {
    return publicUrl;
  }

  return buildRequestHeaderAppUrl(request, pathname);
}

export function isUnauthenticatedSignupPreviewEnabled(): boolean {
  if (process.env.ALLOW_UNAUTHENTICATED_SIGNUP_PREVIEW !== "true") {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const origin = getPublicAppOrigin();
  if (!origin) {
    return false;
  }

  try {
    const hostname = normalizeHostname(new URL(origin).hostname);
    return LOCALHOST_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}
