// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { requireSuperOwner, SuperOwnerAuthError } from "@/lib/super-owner";

/** GET /api/super-owner/status - return the current Super Owner auth state */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSuperOwner(request);
    return NextResponse.json({
      ok: true,
      user: {
        id: session.user.id,
        userId: session.user.userId,
        email: session.user.email,
        isSuperOwner: session.user.isSuperOwner,
        superOwnerGrantedAt: session.user.superOwnerGrantedAt,
      },
    });
  } catch (error) {
    if (error instanceof SuperOwnerAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
