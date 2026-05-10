// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "crypto";

export const SIGNUP_REQUEST_COOKIE = "signup-request-id";
export const SIGNUP_REQUEST_COOKIE_MAX_AGE = 60 * 30;
export const SIGNUP_TOKEN_TTL_MS = 10 * 60 * 1000;
export const ORGANIZATION_NAME_MAX_LENGTH = 120;

const SIGNUP_USER_ID_RE = /^[a-zA-Z0-9_\-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidSignupUserId(userId: string): boolean {
  return SIGNUP_USER_ID_RE.test(userId);
}

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidSignupEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return null;
}

export function normalizeOrganizationName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isValidOrganizationName(name: string): boolean {
  return name.length <= ORGANIZATION_NAME_MAX_LENGTH;
}

export function generateSignupToken(): string {
  return randomUUID();
}

export function computeSignupExpiry(): string {
  return new Date(Date.now() + SIGNUP_TOKEN_TTL_MS).toISOString();
}