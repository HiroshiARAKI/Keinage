// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

import { enUS, type MessageKey } from "./en-US";
import { jaJP } from "./ja-JP";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import { koKR } from "./ko-KR";
import { es419 } from "./es-419";
import { fr } from "./fr";
import { de } from "./de";

type MessageCatalog = Record<MessageKey, string>;

export type { MessageKey };

export const MESSAGE_CATALOGS = {
  "ja-JP": jaJP,
  "en-US": enUS,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "ko-KR": koKR,
  "es-419": es419,
  fr,
  de,
} as const satisfies Record<string, MessageCatalog>;
