// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/LocaleProvider";

interface DirectoryUser {
  userId: string;
  email: string;
  role: string;
  attribute: string;
  organizationName: string | null;
  plan: string;
  status: string;
  createdAt: string;
}

interface DirectoryResponse {
  users: DirectoryUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function statusVariant(status: string) {
  if (status === "locked") return "destructive" as const;
  return status === "active" ? "outline" as const : "secondary" as const;
}

export function SuperOwnerUserDirectory() {
  const { t, formatDateTime } = useLocale();
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/super-owner/users?page=${page}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setError(t("superOwnerUsers.fetchError"));
        return;
      }
      setData(await response.json() as DirectoryResponse);
    } catch {
      setError(t("superOwnerUsers.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  function statusLabel(status: string) {
    const labels: Record<string, Parameters<typeof t>[0]> = {
      active: "superOwnerUsers.statusActive",
      disabled: "superOwnerUsers.statusDisabled",
      inactive_due_to_plan: "superOwnerUsers.statusInactiveDueToPlan",
      locked: "superOwnerUsers.statusLocked",
    };
    const key = labels[status];
    return key ? t(key) : status;
  }

  return (
    <div className="space-y-4">
      {data && (
        <p className="text-sm text-muted-foreground">
          {t("superOwnerUsers.total", { count: data.pagination.total })}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !data || data.users.length === 0 ? (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          {t("superOwnerUsers.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("common.userId")}</th>
                <th className="px-4 py-2 text-left">{t("common.email")}</th>
                <th className="px-4 py-2 text-left">{t("common.role")}</th>
                <th className="px-4 py-2 text-left">{t("common.attribute")}</th>
                <th className="px-4 py-2 text-left">{t("superOwnerUsers.organizationName")}</th>
                <th className="px-4 py-2 text-left">{t("superOwnerUsers.plan")}</th>
                <th className="px-4 py-2 text-left">{t("superOwnerUsers.status")}</th>
                <th className="px-4 py-2 text-left">{t("common.createdAt")}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.userId} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{user.userId}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? t("common.roleAdmin") : t("common.roleGeneral")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.attribute === "owner" ? "default" : "secondary"}>
                      {user.attribute === "owner" ? t("users.owner") : t("users.shared")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{user.organizationName ?? "-"}</td>
                  <td className="px-4 py-3">{user.plan}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(user.status)}>
                      {statusLabel(user.status)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDateTime(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("superOwnerUsers.previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("superOwnerUsers.page", {
              page: data.pagination.page,
              totalPages: data.pagination.totalPages,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= data.pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("superOwnerUsers.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
