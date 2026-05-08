// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import nodemailer from "nodemailer";
import type { OwnerSubscriptionState } from "@/lib/billing";
import {
  CONTACT_CATEGORY_LABELS,
  type ContactCategory,
} from "@/lib/contact-shared";
import type { PlanDefinition } from "@/lib/plans";

interface ContactSmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getContactSmtpConfig(): ContactSmtpConfig | null {
  const host = readEnv("CONTACT_SMTP_HOST") ?? readEnv("SMTP_HOST");
  const user = readEnv("CONTACT_SMTP_USER") ?? readEnv("SMTP_USER");
  const pass = readEnv("CONTACT_SMTP_PASS") ?? readEnv("SMTP_PASS");
  const from = readEnv("CONTACT_SMTP_FROM") ?? readEnv("SMTP_FROM") ?? user;
  const to = readEnv("CONTACT_TO_EMAIL");
  const port = Number(readEnv("CONTACT_SMTP_PORT") ?? readEnv("SMTP_PORT") ?? "587");

  if (!host || !user || !pass || !from || !to || !Number.isFinite(port)) {
    return null;
  }

  return { host, port, user, pass, from, to };
}

export function isContactSmtpConfigured(): boolean {
  return getContactSmtpConfig() !== null;
}

export async function sendContactEmail(input: {
  owner: {
    id: string;
    userId: string;
    email: string;
    phoneNumber: string | null;
  };
  submittedBy: {
    id: string;
    userId: string;
    email: string;
    role: string;
  };
  plan: PlanDefinition;
  subscription: OwnerSubscriptionState | null;
  category: ContactCategory;
  title: string;
  body: string;
}): Promise<boolean> {
  const config = getContactSmtpConfig();
  if (!config) return false;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      replyTo: input.owner.email,
      subject: `[Keinage Contact] ${input.title}`,
      text: [
        "Keinage 問い合わせを受け付けました。",
        "",
        "## 問い合わせ",
        `カテゴリ: ${CONTACT_CATEGORY_LABELS[input.category]} (${input.category})`,
        `件名: ${input.title}`,
        "",
        input.body,
        "",
        "## Owner",
        `Owner ID: ${input.owner.id}`,
        `Owner userId: ${input.owner.userId}`,
        `Owner email: ${input.owner.email}`,
        `Owner phone: ${input.owner.phoneNumber ?? "-"}`,
        "",
        "## Submitted by",
        `User ID: ${input.submittedBy.id}`,
        `User userId: ${input.submittedBy.userId}`,
        `User email: ${input.submittedBy.email}`,
        `User role: ${input.submittedBy.role}`,
        "",
        "## Plan",
        `Plan: ${input.plan.name} (${input.plan.code})`,
        `Subscription status: ${input.subscription?.status ?? "none"}`,
        `Stripe customer: ${input.subscription?.stripeCustomerId ?? "-"}`,
        `Stripe subscription: ${input.subscription?.stripeSubscriptionId ?? "-"}`,
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("[contact] Failed to send contact email", error);
    return false;
  }
}
