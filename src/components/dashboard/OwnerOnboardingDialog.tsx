// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, MonitorPlay, Plus, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OwnerOnboardingDialogProps {
  initialOpen: boolean;
  billingEnabled: boolean;
}

export function OwnerOnboardingDialog({
  initialOpen,
  billingEnabled,
}: OwnerOnboardingDialogProps) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const acknowledge = async () => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/owner/onboarding/acknowledge", {
        method: "POST",
      });

      if (!response.ok) {
        setError(t("ownerOnboarding.error"));
        return false;
      }

      setOpen(false);
      router.refresh();
      return true;
    } catch {
      setError(t("ownerOnboarding.error"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const closeDialog = () => {
    if (saving) return;
    void acknowledge();
  };

  const moveAfterAcknowledge = (href: string) => {
    if (saving) return;
    void (async () => {
      const ok = await acknowledge();
      if (ok) router.push(href);
    })();
  };

  if (!initialOpen && !open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <DialogTitle className="text-xl">
            {t("ownerOnboarding.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>{t("ownerOnboarding.thanks")}</p>
          <p>{t("ownerOnboarding.description")}</p>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex gap-3">
              <Plus className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">
                  {t("ownerOnboarding.boardStepTitle")}
                </div>
                <div>{t("ownerOnboarding.boardStepDescription")}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <MonitorPlay className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">
                  {t("ownerOnboarding.displayStepTitle")}
                </div>
                <div>{t("ownerOnboarding.displayStepDescription")}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <CreditCard className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">
                  {t("ownerOnboarding.planStepTitle")}
                </div>
                <div>{t("ownerOnboarding.planStepDescription")}</div>
              </div>
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={closeDialog}
            disabled={saving}
          >
            {t("ownerOnboarding.later")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => moveAfterAcknowledge(billingEnabled ? "/billing" : "/settings")}
            disabled={saving}
          >
            <CreditCard data-icon="inline-start" />
            {t("ownerOnboarding.planAction")}
          </Button>
          <Button
            type="button"
            onClick={() => moveAfterAcknowledge("/boards/new")}
            disabled={saving}
          >
            <Plus data-icon="inline-start" />
            {t("ownerOnboarding.createBoard")}
            <ExternalLink data-icon="inline-end" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
