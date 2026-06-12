// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";

/** GET /api/time - return the current server time for display synchronization. */
export function GET() {
  return NextResponse.json(
    { serverTime: Date.now() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
