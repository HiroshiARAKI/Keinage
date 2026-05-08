// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "low" | "medium" | "high" | "critical";
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
      && (announcement.severity === "high" || announcement.severity === "critical")
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
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg border border-red-200 bg-background p-4 text-sm shadow-lg dark:border-red-900/60">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1 space-y-2">
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
        </div>
      )}
    </>
  );
}
