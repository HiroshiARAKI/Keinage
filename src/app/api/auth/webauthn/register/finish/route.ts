// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSessionUserAllowingWebAuthnPending, AUTH_SESSION_COOKIE } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  buildWebAuthnConfig,
  buildWebAuthnRateLimitKey,
  checkWebAuthnRateLimit,
  clearWebAuthnFailures,
  consumeChallenge,
  isWebAuthnEnabled,
  markSessionWebAuthnVerified,
  recordWebAuthnFailure,
  storeRegistrationCredential,
} from "@/lib/webauthn";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";
import { sendSecurityNotification } from "@/lib/security-notifications";

function readChallenge(response: RegistrationResponseJSON) {
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
      action: "passkey_registered",
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
      action: "passkey_registered",
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
      action: "passkey_registered",
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
    type: "registration",
  });
  const rateLimit = await checkWebAuthnRateLimit(rateLimitKey);
  if (rateLimit.limited) {
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_registered",
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

  const response = await request.json() as RegistrationResponseJSON;
  const rawChallenge = readChallenge(response);
  if (!rawChallenge) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_registered",
      targetType: "passkey",
      result: "failure",
      reason: "invalid_client_data",
      request,
    });
    return NextResponse.json({ error: "Passkey登録に失敗しました。" }, { status: 400 });
  }

  const challenge = await consumeChallenge({
    userId: session.user.id,
    challenge: rawChallenge,
    type: "registration",
  });
  if (!challenge) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_registered",
      targetType: "passkey",
      result: "failure",
      reason: "challenge_invalid_or_expired",
      request,
    });
    return NextResponse.json({ error: "認証の有効期限が切れました。もう一度お試しください。" }, { status: 400 });
  }

  const config = buildWebAuthnConfig(request);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: true,
  }).catch(() => null);

  if (!verification?.verified || !verification.registrationInfo) {
    await recordWebAuthnFailure(rateLimitKey);
    await writeUserAuditLog({
      user: session.user,
      action: "passkey_registered",
      targetType: "passkey",
      result: "failure",
      reason: "verification_failed",
      request,
    });
    return NextResponse.json({ error: "Passkey登録に失敗しました。" }, { status: 400 });
  }

  await storeRegistrationCredential({
    userId: session.user.id,
    response,
    credential: verification.registrationInfo.credential,
    credentialDeviceType: verification.registrationInfo.credentialDeviceType,
    credentialBackedUp: verification.registrationInfo.credentialBackedUp,
  });

  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (sessionToken) {
    await markSessionWebAuthnVerified(sessionToken);
  }
  await clearWebAuthnFailures(rateLimitKey);
  await writeUserAuditLog({
    user: session.user,
    action: "passkey_registered",
    targetType: "passkey",
    targetId: verification.registrationInfo.credential.id,
    result: "success",
    request,
    metadata: {
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
    },
  });
  await sendSecurityNotification({
    user: session.user,
    type: "passkey_registered",
    request,
    metadata: {
      passkeyId: verification.registrationInfo.credential.id,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
    },
  });

  return NextResponse.json({ success: true });
}
