// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { pinAttempts, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  isContactSmtpConfigured,
  sendContactEmail,
} from "@/lib/contact";
import { CONTACT_CATEGORIES, type ContactCategory } from "@/lib/contact-shared";
import { getEffectivePlanForUser } from "@/lib/billing";
import { resolveOwnerUserId } from "@/lib/ownership";
import {
  buildRateLimitKey,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX = 3;
const PAID_PLAN_CODES = new Set(["lite", "standard", "standard_plus"]);

function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string"
    && CONTACT_CATEGORIES.includes(value as ContactCategory);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const effectivePlan = await getEffectivePlanForUser(session.user);
  if (!PAID_PLAN_CODES.has(effectivePlan.plan.code)) {
    return NextResponse.json(
      { error: "問い合わせフォームは有料プランで利用できます", code: "contact_plan_unavailable" },
      { status: 403 },
    );
  }

  if (!isContactSmtpConfigured()) {
    return NextResponse.json(
      { error: "問い合わせ送信の設定が未完了です", code: "contact_smtp_unconfigured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body && typeof body === "object"
    ? body as Record<string, unknown>
    : {};
  const category = input.category;
  const title = cleanText(input.title, 120);
  const message = cleanText(input.body, 4000);

  if (!isContactCategory(category) || !title || !message) {
    return NextResponse.json(
      { error: "category, title, body are required", code: "contact_invalid_input" },
      { status: 400 },
    );
  }

  const ownerUserId = resolveOwnerUserId(session.user);
  const owner = await db.query.users.findFirst({
    where: eq(users.id, ownerUserId),
  });
  if (!owner) {
    return NextResponse.json(
      { error: "Ownerユーザーが見つかりません", code: "owner_not_found" },
      { status: 404 },
    );
  }

  const clientIp = resolveRateLimitClientIp(request);
  const rateLimitKey = buildRateLimitKey({
    flow: "contact",
    clientIp,
    subject: ownerUserId,
  });
  const threshold = new Date(Date.now() - CONTACT_RATE_LIMIT_WINDOW_MS).toISOString();
  const recentAttempts = await db
    .select({ id: pinAttempts.id })
    .from(pinAttempts)
    .where(
      and(
        eq(pinAttempts.ipAddress, rateLimitKey),
        gt(pinAttempts.attemptedAt, threshold),
      ),
    );

  if (recentAttempts.length >= CONTACT_RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        error: "問い合わせ送信の上限に達しました。しばらくしてから再度お試しください。",
        code: "contact_rate_limited",
      },
      { status: 429 },
    );
  }

  const sent = await sendContactEmail({
    owner: {
      id: owner.id,
      userId: owner.userId,
      email: owner.email,
      phoneNumber: owner.phoneNumber,
    },
    submittedBy: {
      id: session.user.id,
      userId: session.user.userId,
      email: session.user.email,
      role: session.user.role,
    },
    plan: effectivePlan.plan,
    subscription: effectivePlan.subscription,
    category,
    title,
    body: message,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "問い合わせを送信できませんでした", code: "contact_send_failed" },
      { status: 500 },
    );
  }

  await db.insert(pinAttempts).values({ ipAddress: rateLimitKey });

  return NextResponse.json({ ok: true });
}
