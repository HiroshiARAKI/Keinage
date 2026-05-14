// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserAllowingWebAuthnPending } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  createRegistrationOptions,
  isWebAuthnEnabled,
} from "@/lib/webauthn";
import { writeAuditLog, writeUserAuditLog } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  if (!isWebAuthnEnabled()) {
    await writeAuditLog({
      action: "passkey_registration_started",
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
      action: "passkey_registration_started",
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
      action: "passkey_registration_started",
      targetType: "passkey",
      result: "denied",
      reason: "owner_required",
      request,
    });
    return NextResponse.json({ error: "Ownerアカウントのみ利用できます" }, { status: 403 });
  }

  const options = await createRegistrationOptions({ request, user: session.user });
  await writeUserAuditLog({
    user: session.user,
    action: "passkey_registration_started",
    targetType: "passkey",
    result: "success",
    request,
  });
  return NextResponse.json(options);
}
