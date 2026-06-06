// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AnnouncementSeverity,
  AnnouncementType,
} from "@/components/dashboard/announcement-presentation";

export type AnnouncementTargetScope =
  | "all"
  | "free"
  | "paid"
  | "lite"
  | "standard"
  | "standard_plus";
export type AnnouncementStatus = "draft" | "published" | "archived";

export interface Announcement {
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
  readAt: string | null;
  acknowledgedAt: string | null;
}

type AnnouncementAction = "read" | "acknowledge";

interface AnnouncementContextValue {
  announcements: Announcement[];
  loading: boolean;
  unreadCount: number;
  refreshAnnouncements: () => Promise<void>;
  markAnnouncement: (id: string, action: AnnouncementAction) => Promise<boolean>;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

async function fetchAnnouncements() {
  try {
    const response = await fetch("/api/announcements", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { announcements?: Announcement[] };
    return data.announcements ?? [];
  } catch {
    return null;
  }
}

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAnnouncements = useCallback(async () => {
    const nextAnnouncements = await fetchAnnouncements();
    if (nextAnnouncements) {
      setAnnouncements(nextAnnouncements);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAnnouncements() {
      const nextAnnouncements = await fetchAnnouncements();
      if (!cancelled && nextAnnouncements) {
        setAnnouncements(nextAnnouncements);
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    void loadAnnouncements();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAnnouncement = useCallback(async (id: string, action: AnnouncementAction) => {
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

    try {
      const response = await fetch(`/api/announcements/${id}/${action}`, { method: "POST" });
      if (response.ok) return true;
    } catch {
      // Restore the server state below.
    }

    await refreshAnnouncements();
    return false;
  }, [refreshAnnouncements]);

  const value = useMemo<AnnouncementContextValue>(() => ({
    announcements,
    loading,
    unreadCount: announcements.filter((announcement) => !announcement.readAt).length,
    refreshAnnouncements,
    markAnnouncement,
  }), [announcements, loading, markAnnouncement, refreshAnnouncements]);

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error("useAnnouncements must be used within AnnouncementProvider");
  }
  return context;
}
