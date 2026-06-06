// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react";
import {
  AnnouncementRequiredMark,
  getAnnouncementAppearance,
  getRequiredAnnouncementLabelKey,
  type AnnouncementSeverity,
  type AnnouncementType,
} from "@/components/dashboard/announcement-presentation";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  severity: AnnouncementSeverity;
  requireAcknowledgement: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
}

async function postAnnouncementAction(id: string, action: "read" | "acknowledge") {
  await fetch(`/api/announcements/${id}/${action}`, { method: "POST" });
}

export function AnnouncementBanner() {
  const { t } = useLocale();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function loadAnnouncements() {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = await res.json() as { announcements?: Announcement[] };
      if (!cancelled) {
        setAnnouncements(data.announcements ?? []);
      }
    }
    void loadAnnouncements();
    return () => {
      cancelled = true;
    };
  }, []);

  const important = useMemo(
    () => announcements.find((announcement) => (
      !announcement.readAt
      && !dismissedIds.has(announcement.id)
      && announcement.severity === "high"
    )),
    [announcements, dismissedIds],
  );

  const required = useMemo(
    () => announcements.find((announcement) => (
      announcement.requireAcknowledgement
      && !announcement.acknowledgedAt
    )),
    [announcements],
  );

  const requiredAppearance = required ? getAnnouncementAppearance(required.type) : null;
  const requiredLabel = required ? (() => {
    const key = getRequiredAnnouncementLabelKey(required.severity);
    return key ? t(key as Parameters<typeof t>[0]) : null;
  })() : null;

  async function markRead(id: string) {
    setAnnouncements((current) => current.map((announcement) => (
      announcement.id === id
        ? { ...announcement, readAt: new Date().toISOString() }
        : announcement
    )));
    await postAnnouncementAction(id, "read");
  }

  async function acknowledge(id: string) {
    const now = new Date().toISOString();
    setAnnouncements((current) => current.map((announcement) => (
      announcement.id === id
        ? { ...announcement, readAt: now, acknowledgedAt: now }
        : announcement
    )));
    await postAnnouncementAction(id, "acknowledge");
  }

  return (
    <>
      {important && (
        <div className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
            <AlertTriangle className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 truncate">
              <span className="font-medium">{t("announcements.bannerImportant")}</span>{" "}
              {important.title}
            </p>
            <Link
              href="/announcements"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
            >
              <ExternalLink className="size-3.5" />
              {t("announcements.details")}
            </Link>
            <button
              type="button"
              className="rounded-md p-1 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
              aria-label={t("announcements.dismiss")}
              onClick={() => {
                setDismissedIds((current) => new Set(current).add(important.id));
                markRead(important.id);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {required && (
        <div className={cn(
          "fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border bg-background/95 p-4 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90",
          requiredAppearance?.panelClassName,
        )}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <AnnouncementRequiredMark type={required.type} label={requiredLabel} />
            </div>
            <div>
              <p className="font-medium">{required.title}</p>
              <p className="line-clamp-2 text-muted-foreground">{required.body}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/announcements"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                {t("announcements.details")}
              </Link>
              <Button size="sm" onClick={() => acknowledge(required.id)}>
                <CheckCircle2 className="size-3.5" />
                {t("announcements.acknowledge")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
