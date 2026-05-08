// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { getAdminSessionUser } from "@/lib/auth";
import { getEffectivePlanForUser } from "@/lib/billing";
import {
  BOARD_DEVICE_ONLINE_THRESHOLD_MS,
  canUseBoardDeviceStatus,
  listBoardDeviceStatuses,
} from "@/lib/board-device-status";

export async function GET() {
  const session = await getAdminSessionUser();
  if (!session) {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const effectivePlan = await getEffectivePlanForUser(session.user);
  const enabled = canUseBoardDeviceStatus(effectivePlan);
  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      devices: [],
      onlineThresholdSeconds: BOARD_DEVICE_ONLINE_THRESHOLD_MS / 1000,
      planName: effectivePlan.plan.name,
    });
  }

  const devices = await listBoardDeviceStatuses(effectivePlan.ownerUserId);

  return NextResponse.json({
    enabled: true,
    devices,
    onlineThresholdSeconds: BOARD_DEVICE_ONLINE_THRESHOLD_MS / 1000,
    planName: effectivePlan.plan.name,
  });
}
