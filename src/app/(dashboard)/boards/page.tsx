// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { CalendarClock, Plus, ExternalLink, Globe, Lock, Settings2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { templates } from "@/lib/templates";
import { getSessionUser } from "@/lib/auth";
import { getRequestI18n } from "@/lib/i18n-server";
import { resolveOwnerUserId } from "@/lib/ownership";
import { getPlanBoardSelectionState } from "@/lib/plan-board-selection";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  const session = await getSessionUser();
  if (!session) {
    return null;
  }
  const { t, formatDate, getTemplateCopy } = await getRequestI18n();

  const ownerUserId = resolveOwnerUserId(session.user);
  const [allBoards, boardSelection] = await Promise.all([
    db
      .select()
      .from(boards)
      .where(eq(boards.ownerUserId, ownerUserId))
      .orderBy(desc(boards.createdAt)),
    getPlanBoardSelectionState(ownerUserId),
  ]);
  const showPendingPlanNotice =
    boardSelection.selectionMode === "pending"
    && boardSelection.pendingPlanEffectiveAt !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">{t("boards.title")}</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("boards.subtitle")}
          </p>
        </div>
        <Link
          href="/boards/new"
          className={buttonVariants()}
        >
          <Plus data-icon="inline-start" />
          {t("boards.new")}
        </Link>
      </div>

      {showPendingPlanNotice && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">{t("boards.pendingPlanNoticeTitle")}</div>
                <div className="mt-1">
                  {t("boards.pendingPlanNoticeDescription", {
                    plan: boardSelection.selectionPlanName,
                    limit: boardSelection.limit ?? t("billing.value.unlimited"),
                    count: boardSelection.selectedBoardIds.length,
                  })}
                </div>
              </div>
            </div>
            <Link
              href="/billing#board-activation"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("boards.pendingPlanAction")}
            </Link>
          </div>
        </div>
      )}

      {allBoards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              {t("boards.empty")}
            </p>
            <Link
              href="/boards/new"
              className={buttonVariants()}
            >
              <Plus data-icon="inline-start" />
              {t("boards.firstCreate")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allBoards.map((board) => {
            const template = templates[board.templateId as keyof typeof templates];
            const templateCopy = getTemplateCopy(board.templateId);
            return (
              <Card key={board.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{board.name}</CardTitle>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge
                        variant={
                          board.status === "inactive_due_to_plan"
                            ? "secondary"
                            : board.isActive
                              ? "default"
                              : "secondary"
                        }
                      >
                        {board.status === "inactive_due_to_plan"
                          ? t("boards.inactiveDueToPlanBadge")
                          : board.isActive
                            ? t("common.enabled")
                            : t("common.disabled")}
                      </Badge>
                      <Badge variant={board.visibility === "public" ? "default" : "secondary"}>
                        {board.visibility === "public" ? (
                          <>
                            <Globe data-icon="inline-start" />
                            {t("common.public")}
                          </>
                        ) : (
                          <>
                            <Lock data-icon="inline-start" />
                            {t("common.private")}
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {template ? templateCopy.name : board.templateId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      {t("common.createdAt")}: {formatDate(board.createdAt)}
                    </div>
                    <div>
                      {board.status === "inactive_due_to_plan"
                        ? t("boards.inactiveDueToPlanHint")
                        : board.visibility === "public"
                        ? t("boards.publicHint")
                        : t("boards.privateHint")}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/boards/${board.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Settings2 data-icon="inline-start" />
                      {t("common.manage")}
                    </Link>
                    <a
                      href={`/${board.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm" })}
                    >
                      <ExternalLink data-icon="inline-start" />
                      {t("common.display")}
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
