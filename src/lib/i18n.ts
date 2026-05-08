// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

import { MESSAGE_CATALOGS, type MessageKey } from "@/lib/i18n-messages";

export const LOCALE_COOKIE_NAME = "keinage-locale";
export const DEFAULT_LOCALE = "en-US";

export interface LocaleDefinition {
  code: string;
  flag: string;
  label: string;
  territory: string;
}

export const SUPPORTED_LOCALES = [
  {
    code: "ja-JP",
    flag: "🇯🇵",
    label: "日本語",
    territory: "日本",
  },
  {
    code: "en-US",
    flag: "🇺🇸",
    label: "English",
    territory: "United States",
  },
  {
    code: "zh-CN",
    flag: "🇨🇳",
    label: "简体中文",
    territory: "中国",
  },
  {
    code: "zh-TW",
    flag: "🇹🇼",
    label: "繁體中文",
    territory: "台灣",
  },
  {
    code: "ko-KR",
    flag: "🇰🇷",
    label: "한국어",
    territory: "대한민국",
  },
  {
    code: "es-419",
    flag: "🇲🇽",
    label: "Español",
    territory: "Latinoamérica",
  },
  {
    code: "fr",
    flag: "🇫🇷",
    label: "Français",
    territory: "France",
  },
  {
    code: "de",
    flag: "🇩🇪",
    label: "Deutsch",
    territory: "Deutschland",
  },
] as const satisfies readonly LocaleDefinition[];

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];
export type { MessageKey };

const localeCodes = new Set<string>(SUPPORTED_LOCALES.map((locale) => locale.code));
const localeByCode = new Map<string, (typeof SUPPORTED_LOCALES)[number]>(
  SUPPORTED_LOCALES.map((locale) => [locale.code, locale]),
);

const languageFallbacks: Record<string, SupportedLocale> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
  "zh-hans": "zh-CN",
  "zh-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-tw": "zh-TW",
  "zh-hk": "zh-TW",
  ko: "ko-KR",
  es: "es-419",
  fr: "fr",
  de: "de",
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return localeCodes.has(value);
}

export function getLocaleDefinition(locale: string | null | undefined) {
  if (!locale || !isSupportedLocale(locale)) {
    return localeByCode.get(DEFAULT_LOCALE)!;
  }

  return localeByCode.get(locale)!;
}

export function parseAcceptLanguage(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];

  return headerValue
    .split(",")
    .map((part) => {
      const [tagPart, ...params] = part.trim().split(";");
      const qualityParam = params.find((param) => param.trim().startsWith("q="));
      const quality = qualityParam ? Number.parseFloat(qualityParam.trim().slice(2)) : 1;
      return {
        tag: tagPart.trim(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.tag);
}

export function matchSupportedLocale(locale: string | null | undefined): SupportedLocale | null {
  if (!locale) return null;

  if (isSupportedLocale(locale)) {
    return locale;
  }

  const normalized = locale.toLowerCase();
  if (normalized in languageFallbacks) {
    return languageFallbacks[normalized as keyof typeof languageFallbacks];
  }

  const language = normalized.split("-")[0];
  return languageFallbacks[language] ?? null;
}

export function resolvePreferredLocale(input: {
  storedLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  const stored = matchSupportedLocale(input.storedLocale);
  if (stored) return stored;

  const cookie = matchSupportedLocale(input.cookieLocale);
  if (cookie) return cookie;

  for (const candidate of parseAcceptLanguage(input.acceptLanguage)) {
    const matched = matchSupportedLocale(candidate);
    if (matched) return matched;
  }

  return DEFAULT_LOCALE;
}

export function translate(
  locale: SupportedLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
) {
  const catalog = MESSAGE_CATALOGS[locale] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE];
  const template = catalog[key] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = vars[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(
  value: string | number | Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(toDate(value));
}

export function formatDateTime(
  value: string | number | Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(toDate(value));
}

export function formatTime(
  value: string | number | Date,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...options,
  }).format(toDate(value));
}

export function getTemplateCopy(templateId: string, locale: SupportedLocale) {
  switch (templateId) {
    case "simple":
      return {
        name: translate(locale, "template.simple.name"),
        description: translate(locale, "template.simple.description"),
      };
    case "photo-clock":
      return {
        name: translate(locale, "template.photo-clock.name"),
        description: translate(locale, "template.photo-clock.description"),
      };
    case "retro":
      return {
        name: translate(locale, "template.retro.name"),
        description: translate(locale, "template.retro.description"),
      };
    case "message":
      return {
        name: translate(locale, "template.message.name"),
        description: translate(locale, "template.message.description"),
      };
    case "call-number":
      return {
        name: translate(locale, "template.call-number.name"),
        description: translate(locale, "template.call-number.description"),
      };
    case "clinic-hours":
      return {
        name: translate(locale, "template.clinic-hours.name"),
        description: translate(locale, "template.clinic-hours.description"),
      };
    case "restaurant-menu":
      return {
        name: translate(locale, "template.restaurant-menu.name"),
        description: translate(locale, "template.restaurant-menu.description"),
      };
    case "qr-info":
      return {
        name: translate(locale, "template.qr-info.name"),
        description: translate(locale, "template.qr-info.description"),
      };
    default:
      return { name: templateId, description: templateId };
  }
}

const WEATHER_TELOP_TRANSLATIONS: Record<SupportedLocale, Array<[string, string]>> = {
  "ja-JP": [],
  "en-US": [
    ["ところにより", "in some areas"],
    ["時々", "occasionally"],
    ["一時", "briefly"],
    ["のち", "later"],
    ["晴れ", "Clear"],
    ["くもり", "Cloudy"],
    ["曇り", "Cloudy"],
    ["雨", "Rain"],
    ["雪", "Snow"],
    ["雷", "Thunder"],
  ],
  "zh-CN": [
    ["ところにより", "局部地区"],
    ["時々", "间歇"],
    ["一時", "短时"],
    ["のち", "随后"],
    ["晴れ", "晴"],
    ["くもり", "多云"],
    ["曇り", "多云"],
    ["雨", "雨"],
    ["雪", "雪"],
    ["雷", "雷"],
  ],
  "zh-TW": [
    ["ところにより", "局部地區"],
    ["時々", "間歇"],
    ["一時", "短暫"],
    ["のち", "之後"],
    ["晴れ", "晴"],
    ["くもり", "多雲"],
    ["曇り", "多雲"],
    ["雨", "雨"],
    ["雪", "雪"],
    ["雷", "雷"],
  ],
  "ko-KR": [
    ["ところにより", "일부 지역"],
    ["時々", "가끔"],
    ["一時", "한때"],
    ["のち", "후"],
    ["晴れ", "맑음"],
    ["くもり", "흐림"],
    ["曇り", "흐림"],
    ["雨", "비"],
    ["雪", "눈"],
    ["雷", "천둥"],
  ],
  "es-419": [
    ["ところにより", "en algunas zonas"],
    ["時々", "a veces"],
    ["一時", "por momentos"],
    ["のち", "después"],
    ["晴れ", "despejado"],
    ["くもり", "nublado"],
    ["曇り", "nublado"],
    ["雨", "lluvia"],
    ["雪", "nieve"],
    ["雷", "truenos"],
  ],
  fr: [
    ["ところにより", "par endroits"],
    ["時々", "par moments"],
    ["一時", "temporairement"],
    ["のち", "puis"],
    ["晴れ", "ensoleillé"],
    ["くもり", "nuageux"],
    ["曇り", "nuageux"],
    ["雨", "pluie"],
    ["雪", "neige"],
    ["雷", "orage"],
  ],
  de: [
    ["ところにより", "örtlich"],
    ["時々", "zeitweise"],
    ["一時", "vorübergehend"],
    ["のち", "später"],
    ["晴れ", "klar"],
    ["くもり", "bewölkt"],
    ["曇り", "bewölkt"],
    ["雨", "Regen"],
    ["雪", "Schnee"],
    ["雷", "Gewitter"],
  ],
};

export function translateWeatherTelop(telop: string, locale: SupportedLocale) {
  if (locale === "ja-JP") return telop;

  return (WEATHER_TELOP_TRANSLATIONS[locale] ?? []).reduce(
    (value, [source, target]) => value.replaceAll(source, target),
    telop,
  );
}
