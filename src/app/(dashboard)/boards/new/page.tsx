// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Globe, Lock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { planLimitMessageKey } from "@/lib/plan-limit";
import type { PlanDefinition } from "@/lib/plans";
import {
  getUnavailableTemplateRequiredPlanCode,
  TEMPLATE_REQUIRED_PLAN_NAMES,
} from "@/lib/template-plan";
import { templates } from "@/lib/templates";
import type { TemplateId } from "@/types";

const templateList = Object.values(templates);
type CurrentPlan = Pick<PlanDefinition, "code" | "name" | "limits">;

export default function NewBoardPage() {
  const router = useRouter();
  const { t, getTemplateCopy } = useLocale();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<TemplateId>("simple");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedTemplateRequiredPlanCode = currentPlan
    ? getUnavailableTemplateRequiredPlanCode(templateId, currentPlan)
    : null;
  const selectedTemplateId = storedTemplateRequiredPlanCode && currentPlan
    ? templateList.find(
        (template) => !getUnavailableTemplateRequiredPlanCode(template.id, currentPlan),
      )?.id ?? templateId
    : templateId;
  const selectedTemplateRequiredPlanCode = currentPlan
    ? getUnavailableTemplateRequiredPlanCode(selectedTemplateId, currentPlan)
    : null;

  useEffect(() => {
    const controller = new AbortController();

    async function fetchCurrentPlan() {
      try {
        const res = await fetch("/api/billing/plan", {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json() as { plan?: CurrentPlan };
        if (data.plan) {
          setCurrentPlan(data.plan);
        }
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          console.error("[boards/new] Failed to load current plan", fetchError);
        }
      }
    }

    void fetchCurrentPlan();

    return () => {
      controller.abort();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTemplateRequiredPlanCode) {
      setError(t("planLimit.templateDisabled"));
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId: selectedTemplateId, visibility }),
    });

    if (!res.ok) {
      const data = await res.json();
      const messageKey = planLimitMessageKey(data.code, data.messageKey);
      setError(messageKey ? t(messageKey) : data.error ?? t("error.createFailed"));
      setSubmitting(false);
      return;
    }

    const board = await res.json();
    router.push(`/boards/${board.id}`);
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/boards"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("boards.backToList")}
        </Link>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t("boards.newTitle")}</CardTitle>
          <CardDescription>{t("boards.newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t("boards.nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("boards.namePlaceholder")}
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-3">
              <Label>{t("boards.templateLabel")}</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {templateList.map((template) => {
                  const templateCopy = getTemplateCopy(template.id);
                  const requiredPlanCode = currentPlan
                    ? getUnavailableTemplateRequiredPlanCode(template.id, currentPlan)
                    : null;
                  const requiredPlanName = requiredPlanCode
                    ? TEMPLATE_REQUIRED_PLAN_NAMES[requiredPlanCode]
                    : null;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={requiredPlanName !== null}
                      onClick={() => {
                        setTemplateId(template.id);
                        setError(null);
                      }}
                      className={`relative overflow-hidden rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-100 ${
                        requiredPlanName
                          ? "border-border bg-muted/30 text-muted-foreground"
                          : selectedTemplateId === template.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className={requiredPlanName ? "pr-20 opacity-75" : undefined}>
                        <div className="font-medium">{templateCopy.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {templateCopy.description}
                        </div>
                      </div>
                      {requiredPlanName && (
                        <>
                          <div className="pointer-events-none absolute inset-0 bg-background/20" />
                          <span className="absolute right-3 top-3 rounded-full border border-primary/25 bg-primary/90 px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                            {t("boards.templateRequiresPlan", { plan: requiredPlanName })}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="board-visibility">{t("boards.visibilityLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("boards.visibilityDescription")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                    visibility === "private"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Lock className="size-3.5" />
                  {t("common.private")}
                </div>
                <Switch
                  id="board-visibility"
                  checked={visibility === "public"}
                  onCheckedChange={(checked) => setVisibility(checked ? "public" : "private")}
                />
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                    visibility === "public"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Globe className="size-3.5" />
                  {t("common.public")}
                </div>
                <Badge variant={visibility === "public" ? "default" : "secondary"}>
                  {visibility === "public"
                    ? t("boards.visibilityPublicStatus")
                    : t("boards.visibilityPrivateStatus")}
                </Badge>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={submitting || !name.trim() || selectedTemplateRequiredPlanCode !== null}
              >
                {submitting ? t("boards.createSubmitting") : t("common.create")}
              </Button>
              <Link
                href="/boards"
                className={buttonVariants({ variant: "outline" })}
              >
                {t("common.cancel")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
