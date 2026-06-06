// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

interface UserRow {
  id: string;
  userId: string;
  email: string;
  attribute: "owner" | "shared";
  role: string;
  status: "active" | "disabled" | "inactive_due_to_plan";
  createdAt: string;
}

interface InvitationRow {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: "invited" | "inactive_due_to_plan";
  expiresAt: string;
  createdAt: string;
}

interface SharedUserUsage {
  activeUsers: number;
  invitedUsers: number;
  inactiveDueToPlanUsers: number;
  inactiveDueToPlanInvitations: number;
  used: number;
  limit: number | null;
  nearLimit: boolean;
  atLimit: boolean;
  planCode: string;
  planName: string;
}

interface UsersResponse {
  users: UserRow[];
  invitations: InvitationRow[];
  usage: SharedUserUsage;
}

export function UserManagement() {
  const { t } = useLocale();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [usage, setUsage] = useState<SharedUserUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create user dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "general">("general");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [invitePreviewUrl, setInvitePreviewUrl] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json() as UsersResponse;
        setUsers(data.users);
        setInvitations(data.invitations);
        setUsage(data.usage);
        setError(null);
      } else {
        setError(t("users.fetchError"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleRoleChange(id: string, role: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t("users.roleChangeError"));
      return;
    }
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
  }

  async function handleStatusChange(
    id: string,
    status: "active" | "inactive_due_to_plan",
  ) {
    setError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t("users.statusChangeError"));
      return;
    }
    await fetchUsers();
  }

  async function handleDelete(id: string, userId: string) {
    if (!confirm(t("users.confirmDelete", { userId }))) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t("users.deleteError"));
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: createUserId.trim(),
          email: createEmail.trim(),
          role: createRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? t("users.createError"));
        setInviteSuccess(null);
        return;
      }
      setCreateUserId("");
      setCreateEmail("");
      setCreateRole("general");
      setInviteSuccess(t("users.inviteSuccess"));
      setInvitePreviewUrl(data.previewUrl ?? null);
      await fetchUsers();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("users.list")}</h2>
          {usage && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("users.usage", {
                used: usage.used,
                limit: usage.limit ?? t("users.unlimited"),
              })}
              {usage.invitedUsers > 0 && (
                <span className="ml-2">
                  {t("users.invitedCount", { count: usage.invitedUsers })}
                </span>
              )}
            </p>
          )}
        </div>
        <Button
          size="sm"
          disabled={usage?.atLimit === true}
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
            setInviteSuccess(null);
            setInvitePreviewUrl(null);
          }}
        >
          <UserPlus className="mr-1.5 size-4" />
          {t("users.add")}
        </Button>
      </div>

      {usage?.nearLimit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="size-4 shrink-0" />
          {t("users.nearLimit")}
        </div>
      )}

      {usage?.atLimit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            {t("users.limitReached", { limit: usage.limit ?? 0 })}
          </div>
          {usage.planCode !== "unlimited" && usage.planCode !== "self_hosted" && (
            <Link
              href="/billing"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {t("users.reviewPlan")}
            </Link>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("common.userId")}</th>
                <th className="px-4 py-2 text-left">{t("common.email")}</th>
                <th className="px-4 py-2 text-left">{t("common.attribute")}</th>
                <th className="px-4 py-2 text-left">{t("common.role")}</th>
                <th className="px-4 py-2 text-left">{t("users.status")}</th>
                <th className="px-4 py-2 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{user.userId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={user.attribute === "owner" ? "default" : "secondary"}>
                      {user.attribute === "owner" ? t("users.owner") : t("users.shared")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role}
                      disabled={user.attribute === "owner"}
                      onValueChange={(v) => handleRoleChange(user.id, v ?? "")}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("common.roleAdmin")}</SelectItem>
                        <SelectItem value="general">{t("common.roleGeneral")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={user.status === "active" ? "outline" : "secondary"}
                      className={user.status === "active"
                        ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                        : ""}
                    >
                      {user.attribute === "owner"
                        ? t("users.statusActive")
                        : user.status === "active"
                          ? t("users.statusActive")
                          : user.status === "inactive_due_to_plan"
                            ? t("users.statusInactiveDueToPlan")
                            : t("users.statusDisabled")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.attribute === "owner" ? (
                      <span className="text-xs text-muted-foreground">{t("users.undeletable")}</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {user.status === "active" ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(user.id, "inactive_due_to_plan")}
                            title={t("users.deactivate")}
                            aria-label={t("users.deactivate")}
                          >
                            <UserX className="size-3.5" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(user.id, "active")}
                            title={t("users.activate")}
                            aria-label={t("users.activate")}
                          >
                            <UserCheck className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDelete(user.id, user.userId)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700"
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("users.pendingInvitations")}</h3>
          <div className="divide-y rounded-lg border">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{invitation.userId}</p>
                  <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
                </div>
                <Badge variant="outline">
                  {invitation.status === "invited"
                    ? t("users.statusInvited")
                    : t("users.statusInactiveDueToPlan")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("users.addDialogTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {t("users.addDialogDescription")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cu-userId">{t("common.userId")}</Label>
              <Input
                id="cu-userId"
                value={createUserId}
                onChange={(e) => setCreateUserId(e.target.value)}
                placeholder="john_doe"
                pattern="[a-zA-Z0-9_\-]{3,32}"
                title={t("users.userIdHint")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">{t("common.email")}</Label>
              <Input
                id="cu-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-role">{t("common.role")}</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as "admin" | "general")}>
                <SelectTrigger id="cu-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("users.roleAdmin")}</SelectItem>
                  <SelectItem value="general">{t("users.roleGeneral")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            {inviteSuccess && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{inviteSuccess}</p>
                {invitePreviewUrl && (
                  <a
                    href={invitePreviewUrl}
                    className="mt-1 block break-all text-blue-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {invitePreviewUrl}
                  </a>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? t("users.createSubmitting") : t("users.inviteSubmit")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
