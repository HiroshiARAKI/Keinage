// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export const CONTACT_CATEGORIES = ["billing", "technical", "bug", "other"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  billing: "請求・プラン",
  technical: "技術的な相談",
  bug: "不具合",
  other: "その他",
};
