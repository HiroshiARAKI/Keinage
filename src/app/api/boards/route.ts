// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { createBoardSchema } from "@/lib/validators";
import { resolveOwnerUserId } from "@/lib/ownership";
import { templates } from "@/lib/templates";
import {
  assertCanCreateBoard,
  assertCanUseTemplate,
  isPlanLimitError,
  planLimitErrorBody,
} from "@/lib/plan-enforcement";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const allBoards = await db
    .select()
    .from(boards)
    .where(eq(boards.ownerUserId, resolveOwnerUserId(session.user)))
    .orderBy(desc(boards.createdAt));
  return NextResponse.json(allBoards);
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = createBoardSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const { name, templateId, visibility, config } = result.data;
  const ownerUserId = resolveOwnerUserId(session.user);

  try {
    await assertCanCreateBoard(ownerUserId);
    await assertCanUseTemplate({ ownerUserId, templateId });
  } catch (error) {
    if (isPlanLimitError(error)) {
      return NextResponse.json(planLimitErrorBody(error), { status: 403 });
    }
    throw error;
  }

  // Apply default config from template if no config provided
  const template = templates[templateId as keyof typeof templates];
  const mergedConfig = Object.keys(config).length > 0 ? config : (template?.defaultConfig ?? {});

  const [inserted] = await db
    .insert(boards)
    .values({
      ownerUserId,
      name,
      visibility,
      templateId,
      config: JSON.stringify(mergedConfig),
    })
    .returning();

  return NextResponse.json(inserted, { status: 201 });
}
