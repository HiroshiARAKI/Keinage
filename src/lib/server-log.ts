// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /password|token|secret|signature|authorization|cookie|credential|challenge|card/i;

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return sanitizeContext(value as LogContext);
  }
  if (typeof value === "string" && value.length > 512) {
    return `${value.slice(0, 512)}...`;
  }
  return value;
}

export function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(value),
    ]),
  );
}

export function serverLog(
  level: LogLevel,
  scope: string,
  message: string,
  context: LogContext = {},
) {
  const payload = {
    scope,
    message,
    ...sanitizeContext(context),
  };

  if (level === "error") {
    console.error(`[${scope}] ${message}`, payload);
    return;
  }
  if (level === "warn") {
    console.warn(`[${scope}] ${message}`, payload);
    return;
  }
  console.info(`[${scope}] ${message}`, payload);
}

