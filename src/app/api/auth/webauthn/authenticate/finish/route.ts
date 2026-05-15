// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { webauthnCredentials } from "@/db/schema";
import { AUTH_SESSION_COOKIE, getSessionUserAllowingWebAuthnPending } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  buildWebAuthnConfig,
  buildWebAuthnRateLimitKey,
  checkWebAuthnRateLimit,
  clearWebAuthnFailures,
  consumeChallenge,
  findCredentialForAuthentication,
  isWebAuthnEnabled,
  markSessionWebAuthnVerified,
  recordWebAuthnFailure,
  toWebAuthnCredential,
} from "@/lib/webauthn";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";

function readChallenge(response: AuthenticationResponseJSON) {
  try {
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: unknown };
    return typeof clientData.challenge === "string" ? clientData.challenge : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!isWebAuthnEnabled()) {
    await writeAuditLog({
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "skipped",
      reason: "webauthn_disabled",
      request,
    });
    return NextResponse.json({ error: "Passkey認証は無効です" }, { status: 404 });
  }

  const session = await getSessionUserAllowingWebAuthnPending();
  if (!session) {
    await writeAuditLog({
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "denied",
      reason: "session_missing",
      request,
    });
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!isOwnerUser(session.user)) {
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "denied",
      reason: "owner_required",
      request,
    });
    return NextResponse.json({ error: "Ownerアカウントのみ利用できます" }, { status: 403 });
  }

  const rateLimitKey = buildWebAuthnRateLimitKey({
    request,
    user: session.user,
    type: "authentication",
  });
  const rateLimit = await checkWebAuthnRateLimit(rateLimitKey);
  if (rateLimit.limited) {
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "denied",
      reason: "rate_limited",
      request,
    });
    return NextResponse.json(
      { error: "試行回数の上限に達しました。24時間後に再度お試しください。", blocked: true },
      { status: 429 },
    );
  }

  const response = await request.json() as AuthenticationResponseJSON;
  const rawChallenge = readChallenge(response);
  if (!rawChallenge) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "failure",
      reason: "invalid_client_data",
      request,
    });
    return NextResponse.json({ error: "Passkey認証に失敗しました。" }, { status: 400 });
  }

  const challenge = await consumeChallenge({
    userId: session.user.id,
    challenge: rawChallenge,
    type: "authentication",
  });
  if (!challenge) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "failure",
      reason: "challenge_invalid_or_expired",
      request,
    });
    return NextResponse.json({ error: "認証の有効期限が切れました。もう一度お試しください。" }, { status: 400 });
  }

  const credential = await findCredentialForAuthentication(response);
  if (!credential || credential.userId !== session.user.id) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      result: "failure",
      reason: "credential_not_found",
      request,
    });
    return NextResponse.json({ error: "登録済みPasskeyが見つかりません。" }, { status: 400 });
  }

  const config = buildWebAuthnConfig(request);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: toWebAuthnCredential(credential),
    requireUserVerification: true,
  }).catch(() => null);

  if (!verification?.verified || !verification.authenticationInfo) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_authentication_failed",
      targetType: "passkey",
      targetId: credential.id,
      result: "failure",
      reason: "verification_failed",
      request,
    });
    return NextResponse.json({ error: "Passkey認証に失敗しました。" }, { status: 400 });
  }

  await db
    .update(webauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date().toISOString(),
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
    })
    .where(eq(webauthnCredentials.id, credential.id));

  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (sessionToken) {
    await markSessionWebAuthnVerified(sessionToken);
  }
  await clearWebAuthnFailures(rateLimitKey);
  await writeUserAuditLog({
    user: session.user,
    action: "passkey_authentication_success",
    targetType: "passkey",
    targetId: credential.id,
    result: "success",
    request,
    metadata: {
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
    },
  });

  return NextResponse.json({ success: true });
}
