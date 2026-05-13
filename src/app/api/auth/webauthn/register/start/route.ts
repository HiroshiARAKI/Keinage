// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserAllowingWebAuthnPending } from "@/lib/auth";
import { isOwnerUser } from "@/lib/ownership";
import {
  createRegistrationOptions,
  isWebAuthnEnabled,
} from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  if (!isWebAuthnEnabled()) {
    return NextResponse.json({ error: "Passkey認証は無効です" }, { status: 404 });
  }

  const session = await getSessionUserAllowingWebAuthnPending();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!isOwnerUser(session.user)) {
    return NextResponse.json({ error: "Ownerアカウントのみ利用できます" }, { status: 403 });
  }

  const options = await createRegistrationOptions({ request, user: session.user });
  return NextResponse.json(options);
}
