// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Edit3,
  Info,
  Mail,
  Megaphone,
  Plus,
  Send,
} from "lucide-react";
import {
  AnnouncementRequiredMark,
  getAnnouncementAppearance,
  getRequiredAnnouncementLabelKey,
  type AnnouncementSeverity,
  type AnnouncementType,
} from "@/components/dashboard/announcement-presentation";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AnnouncementTargetScope = "all" | "free" | "paid" | "lite" | "standard" | "standard_plus";
type AnnouncementStatus = "draft" | "published" | "archived";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  severity: AnnouncementSeverity;
  targetScope: AnnouncementTargetScope;
  publishStatus: AnnouncementStatus;
  startsAt: string | null;
  endsAt: string | null;
  sendEmail: boolean;
  emailSentAt: string | null;
  emailLastError: string | null;
  requireAcknowledgement: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readAt?: string | null;
  acknowledgedAt?: string | null;
}

const TYPES: AnnouncementType[] = ["info", "maintenance", "incident", "billing", "legal", "termination"];
const SEVERITIES: AnnouncementSeverity[] = ["low", "medium", "high", "critical"];
const TARGET_SCOPES: AnnouncementTargetScope[] = ["all", "free", "paid", "lite", "standard", "standard_plus"];
const STATUSES: AnnouncementStatus[] = ["draft", "published", "archived"];

const EMPTY_FORM = {
  id: null as string | null,
  title: "",
  body: "",
  type: "info" as AnnouncementType,
  severity: "medium" as AnnouncementSeverity,
  targetScope: "all" as AnnouncementTargetScope,
  publishStatus: "draft" as AnnouncementStatus,
  startsAt: "",
  endsAt: "",
  sendEmail: false,
  requireAcknowledgement: false,
};

function toLocalInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function severityVariant(severity: AnnouncementSeverity) {
  return severity === "critical" || severity === "high" ? "destructive" : "secondary";
}

export function AnnouncementsClient({ isSuperOwner }: { isSuperOwner: boolean }) {
  const { t, formatDateTime } = useLocale();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [adminAnnouncements, setAdminAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(isSuperOwner);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/announcements", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { announcements?: Announcement[] };
      setAnnouncements(data.announcements ?? []);
    }
    setLoading(false);
  }, []);

  const fetchAdminAnnouncements = useCallback(async () => {
    if (!isSuperOwner) return;
    setAdminLoading(true);
    const res = await fetch("/api/super-owner/announcements", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { announcements?: Announcement[] };
      setAdminAnnouncements(data.announcements ?? []);
    }
    setAdminLoading(false);
  }, [isSuperOwner]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const [userRes, adminRes] = await Promise.all([
        fetch("/api/announcements", { cache: "no-store" }),
        isSuperOwner
          ? fetch("/api/super-owner/announcements", { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (userRes.ok) {
        const data = await userRes.json() as { announcements?: Announcement[] };
        if (!cancelled) setAnnouncements(data.announcements ?? []);
      }
      if (adminRes?.ok) {
        const data = await adminRes.json() as { announcements?: Announcement[] };
        if (!cancelled) setAdminAnnouncements(data.announcements ?? []);
      }
      if (!cancelled) {
        setLoading(false);
        setAdminLoading(false);
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [isSuperOwner]);

  const requiredAnnouncements = useMemo(
    () => announcements.filter((announcement) => (
      announcement.requireAcknowledgement && !announcement.acknowledgedAt
    )),
    [announcements],
  );

  function label(prefix: string, value: string) {
    return t(`announcements.${prefix}.${value}` as Parameters<typeof t>[0]);
  }

  function editAnnouncement(announcement: Announcement) {
    setForm({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      type: announcement.type,
      severity: announcement.severity,
      targetScope: announcement.targetScope,
      publishStatus: announcement.publishStatus,
      startsAt: toLocalInputValue(announcement.startsAt),
      endsAt: toLocalInputValue(announcement.endsAt),
      sendEmail: announcement.sendEmail,
      requireAcknowledgement: announcement.requireAcknowledgement,
    });
    setMessage(null);
    setError(null);
  }

  async function mark(id: string, action: "read" | "acknowledge") {
    const now = new Date().toISOString();
    setAnnouncements((current) => current.map((announcement) => (
      announcement.id === id
        ? {
            ...announcement,
            readAt: now,
            acknowledgedAt: action === "acknowledge" ? now : announcement.acknowledgedAt,
          }
        : announcement
    )));
    await fetch(`/api/announcements/${id}/${action}`, { method: "POST" });
  }

  async function saveAnnouncement(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = {
      title: form.title,
      body: form.body,
      type: form.type,
      severity: form.severity,
      targetScope: form.targetScope,
      publishStatus: form.publishStatus,
      startsAt: fromLocalInputValue(form.startsAt),
      endsAt: fromLocalInputValue(form.endsAt),
      sendEmail: form.sendEmail,
      requireAcknowledgement: form.requireAcknowledgement,
    };
    const res = await fetch(
      form.id ? `/api/super-owner/announcements/${form.id}` : "/api/super-owner/announcements",
      {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      setError(t("announcements.saveFailed"));
      setSaving(false);
      return;
    }
    setMessage(t("announcements.saved"));
    setForm(EMPTY_FORM);
    await Promise.all([fetchAdminAnnouncements(), fetchAnnouncements()]);
    setSaving(false);
  }

  async function runAdminAction(id: string, action: "publish" | "archive") {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/super-owner/announcements/${id}/${action}`, { method: "POST" });
    if (!res.ok) {
      setError(t("announcements.actionFailed"));
      return;
    }
    setMessage(action === "publish" ? t("announcements.published") : t("announcements.archived"));
    await Promise.all([fetchAdminAnnouncements(), fetchAnnouncements()]);
  }

  return (
    <div className="space-y-6">
      {requiredAnnouncements.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
          <Info className="size-4 text-muted-foreground" />
          {t("announcements.requiredNotice", { count: requiredAnnouncements.length })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("announcements.listTitle")}</CardTitle>
          <CardDescription>{t("announcements.listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("announcements.empty")}</p>
          ) : announcements.map((announcement) => {
            const requiresAcknowledgement = announcement.requireAcknowledgement && !announcement.acknowledgedAt;
            const appearance = requiresAcknowledgement ? getAnnouncementAppearance(announcement.type) : null;
            const requiredLabelKey = requiresAcknowledgement
              ? getRequiredAnnouncementLabelKey(announcement.severity)
              : null;
            const requiredLabel = requiredLabelKey
              ? t(requiredLabelKey as Parameters<typeof t>[0])
              : null;

            return (
              <div
                key={announcement.id}
                className={cn("rounded-lg border p-4", requiresAcknowledgement && appearance?.panelClassName)}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {requiresAcknowledgement && appearance ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <AnnouncementRequiredMark type={announcement.type} label={requiredLabel} />
                        <Badge variant="outline" className={appearance.badgeClassName}>
                          {label("type", announcement.type)}
                        </Badge>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{announcement.title}</h2>
                      {!requiresAcknowledgement && (
                        <>
                          <Badge variant="outline">{label("type", announcement.type)}</Badge>
                          <Badge variant={severityVariant(announcement.severity)}>
                            {label("severity", announcement.severity)}
                          </Badge>
                        </>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{announcement.publishedAt ? formatDateTime(announcement.publishedAt) : "-"}</span>
                  <span>{announcement.readAt ? t("announcements.read") : t("announcements.unread")}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!announcement.readAt && (
                    <Button size="sm" variant="outline" onClick={() => mark(announcement.id, "read")}>
                      <CheckCircle2 className="size-3.5" />
                      {t("announcements.markRead")}
                    </Button>
                  )}
                  {requiresAcknowledgement && (
                    <Button size="sm" onClick={() => mark(announcement.id, "acknowledge")}>
                      <CheckCircle2 className="size-3.5" />
                      {t("announcements.acknowledge")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isSuperOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{t("announcements.adminTitle")}</CardTitle>
            <CardDescription>{t("announcements.adminDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-200">{message}</p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

            <form onSubmit={saveAnnouncement} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{form.id ? t("announcements.editTitle") : t("announcements.createTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("announcements.createDescription")}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(EMPTY_FORM)}>
                  <Plus className="size-3.5" />
                  {t("announcements.newDraft")}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="announcement-title">{t("announcements.fieldTitle")}</Label>
                  <Input
                    id="announcement-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="announcement-body">{t("announcements.fieldBody")}</Label>
                  <Textarea
                    id="announcement-body"
                    value={form.body}
                    onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                    rows={5}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("announcements.fieldType")}</Label>
                  <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as AnnouncementType }))}>
                    <SelectTrigger>
                      <SelectValue>{label("type", form.type)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{TYPES.map((type) => <SelectItem key={type} value={type}>{label("type", type)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("announcements.fieldSeverity")}</Label>
                  <Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value as AnnouncementSeverity }))}>
                    <SelectTrigger>
                      <SelectValue>{label("severity", form.severity)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{SEVERITIES.map((severity) => <SelectItem key={severity} value={severity}>{label("severity", severity)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("announcements.fieldTargetScope")}</Label>
                  <Select value={form.targetScope} onValueChange={(value) => setForm((current) => ({ ...current, targetScope: value as AnnouncementTargetScope }))}>
                    <SelectTrigger>
                      <SelectValue>{label("target", form.targetScope)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{TARGET_SCOPES.map((scope) => <SelectItem key={scope} value={scope}>{label("target", scope)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("announcements.fieldStatus")}</Label>
                  <Select value={form.publishStatus} onValueChange={(value) => setForm((current) => ({ ...current, publishStatus: value as AnnouncementStatus }))}>
                    <SelectTrigger>
                      <SelectValue>{label("status", form.publishStatus)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{label("status", status)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="announcement-starts">{t("announcements.fieldStartsAt")}</Label>
                  <Input id="announcement-starts" type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="announcement-ends">{t("announcements.fieldEndsAt")}</Label>
                  <Input id="announcement-ends" type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span>{t("announcements.fieldSendEmail")}</span>
                  <Switch checked={form.sendEmail} onCheckedChange={(checked) => setForm((current) => ({ ...current, sendEmail: checked }))} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span>{t("announcements.fieldRequireAck")}</span>
                  <Switch checked={form.requireAcknowledgement} onCheckedChange={(checked) => setForm((current) => ({ ...current, requireAcknowledgement: checked }))} />
                </label>
              </div>

              <Button type="submit" disabled={saving}>
                <Megaphone className="size-4" />
                {saving ? t("announcements.saving") : t("announcements.saveDraft")}
              </Button>
            </form>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">{t("announcements.adminListTitle")}</h2>
              {adminLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : adminAnnouncements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("announcements.adminEmpty")}</p>
              ) : adminAnnouncements.map((announcement) => (
                <div key={announcement.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{announcement.title}</p>
                      <Badge variant={announcement.publishStatus === "published" ? "default" : "secondary"}>
                        {label("status", announcement.publishStatus)}
                      </Badge>
                      <Badge variant={severityVariant(announcement.severity)}>
                        {label("severity", announcement.severity)}
                      </Badge>
                      {announcement.sendEmail && <Mail className="size-4 text-muted-foreground" />}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{announcement.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {announcement.publishedAt ? formatDateTime(announcement.publishedAt) : formatDateTime(announcement.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => editAnnouncement(announcement)}>
                      <Edit3 className="size-3.5" />
                      {t("announcements.edit")}
                    </Button>
                    {announcement.publishStatus !== "published" && (
                      <Button size="sm" onClick={() => runAdminAction(announcement.id, "publish")}>
                        <Send className="size-3.5" />
                        {t("announcements.publish")}
                      </Button>
                    )}
                    {announcement.publishStatus !== "archived" && (
                      <Button size="sm" variant="outline" onClick={() => runAdminAction(announcement.id, "archive")}>
                        <Archive className="size-3.5" />
                        {t("announcements.archive")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
