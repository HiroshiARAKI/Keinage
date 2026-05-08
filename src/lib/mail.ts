// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import nodemailer from "nodemailer";

/** SMTP configuration from environment variables */
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    return null;
  }

  return { host, port, user, pass, from };
}

/** Check if SMTP is configured */
export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

async function sendTextMail(options: {
  to: string;
  subject: string;
  lines: string[];
}): Promise<boolean> {
  const config = getSmtpConfig();
  if (!config) {
    console.warn("[mail] SMTP not configured — skipping email send");
    return false;
  }

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
      to: options.to,
      subject: options.subject,
      text: options.lines.join("\n"),
    });
    return true;
  } catch (err) {
    console.error("[mail] Failed to send email:", err);
    return false;
  }
}

export async function sendPlainTextEmail(options: {
  to: string;
  subject: string;
  lines: string[];
}): Promise<boolean> {
  return sendTextMail(options);
}

/** Send a PIN reset email */
export async function sendPinResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  return sendTextMail({
    to,
    subject: "[Keinage] PIN初期化リンク",
    lines: [
        "Keinage のPIN初期化リクエストを受け付けました。",
        "",
        "以下のリンクからPINを再設定してください：",
        resetUrl,
        "",
        "このリンクは30分間有効です。",
        "心当たりがない場合は、このメールを無視してください。",
    ],
  });
}

/** Send an owner signup email */
export async function sendOwnerSignupEmail(
  to: string,
  signupUrl: string,
): Promise<boolean> {
  return sendTextMail({
    to,
    subject: "[Keinage] Ownerアカウント登録リンク",
    lines: [
      "Keinage のOwnerアカウント登録リクエストを受け付けました。",
      "",
      "以下のリンクからパスワード登録を完了してください：",
      signupUrl,
      "",
      "このリンクは10分間有効です。",
      "心当たりがない場合は、このメールを無視してください。",
    ],
  });
}

/** Send a shared user invitation email */
export async function sendSharedSignupEmail(
  to: string,
  signupUrl: string,
): Promise<boolean> {
  return sendTextMail({
    to,
    subject: "[Keinage] Sharedアカウント招待リンク",
    lines: [
      "Keinage のSharedアカウント招待を受け取りました。",
      "",
      "以下のリンクからアカウント登録を完了してください：",
      signupUrl,
      "",
      "このリンクは10分間有効です。",
      "心当たりがない場合は、このメールを無視してください。",
    ],
  });
}

/** Send an owner account deletion confirmation email */
export async function sendAccountDeletionEmail(
  to: string,
  deletionUrl: string,
): Promise<boolean> {
  return sendTextMail({
    to,
    subject: "[Keinage] アカウント削除確認リンク",
    lines: [
      "Keinage のOwnerアカウント削除リクエストを受け付けました。",
      "",
      "以下のリンクを開くと、Ownerアカウントと紐づくデータが削除されます：",
      deletionUrl,
      "",
      "このリンクは10分間有効です。",
      "心当たりがない場合は、このメールを無視してください。",
    ],
  });
}
