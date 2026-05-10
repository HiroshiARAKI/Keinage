// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  CreditCard,
  Activity,
  Bell,
  MessageCircle,
  LayoutDashboard,
  Settings,
  Users,
  Menu,
  X,
} from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Separator } from "@/components/ui/separator";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import { KeinageLogo } from "@/components/KeinageLogo";
import { AnnouncementBanner } from "@/components/dashboard/AnnouncementBanner";
import { OwnerOnboardingDialog } from "@/components/dashboard/OwnerOnboardingDialog";

function getThemeBootstrapScript(initialTheme: "system" | "light" | "dark") {
  return `(() => {
    const root = document.currentScript?.parentElement;
    if (!root) return;
    const theme = ${JSON.stringify(initialTheme)};
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  })();`;
}

function SidebarLink({
  href,
  icon: Icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}

export function DashboardShell({
  userId,
  role,
  organizationName,
  isSuperOwner,
  billingEnabled,
  initialTheme,
  showOwnerOnboarding,
  children,
}: {
  userId: string;
  role: string;
  organizationName: string | null;
  isSuperOwner: boolean;
  billingEnabled: boolean;
  initialTheme: "system" | "light" | "dark";
  showOwnerOnboarding: boolean;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initialResolvedTheme = initialTheme === "system" ? undefined : initialTheme;
  const { t } = useLocale();

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const sidebarContent = (
    <>
      <div className="flex min-h-14 items-center gap-2 px-4 py-3">
        <Link href="/boards" className="flex items-center gap-2 font-bold" onClick={closeSidebar}>
          <KeinageLogo className="h-5 w-auto text-foreground" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span>Keinage</span>
            {organizationName && (
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {t("dashboard.brandFor", { organizationName })}
              </span>
            )}
          </div>
        </Link>
        {/* Close button: mobile only */}
        <button
          onClick={closeSidebar}
          className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:hidden"
          aria-label={t("dashboard.menuClose")}
        >
          <X className="size-5" />
        </button>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 px-4 py-2">
        <span className="text-xs text-muted-foreground">{userId}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            role === "admin"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          {role === "admin" ? t("common.roleAdmin") : t("common.roleGeneral")}
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-1">
        <SidebarLink href="/boards" icon={LayoutDashboard} onClick={closeSidebar}>
          {t("dashboard.navBoards")}
        </SidebarLink>
        {role === "admin" && (
          <SidebarLink href="/users" icon={Users} onClick={closeSidebar}>
            {t("dashboard.navUsers")}
          </SidebarLink>
        )}
        {role === "admin" && billingEnabled && (
          <SidebarLink href="/billing" icon={CreditCard} onClick={closeSidebar}>
            {t("dashboard.navBilling")}
          </SidebarLink>
        )}
        {role === "admin" && (
          <SidebarLink href="/status" icon={Activity} onClick={closeSidebar}>
            {t("dashboard.navStatus")}
          </SidebarLink>
        )}
        <SidebarLink href="/contact" icon={MessageCircle} onClick={closeSidebar}>
          {t("dashboard.navContact")}
        </SidebarLink>
        <SidebarLink href="/announcements" icon={Bell} onClick={closeSidebar}>
          {isSuperOwner ? t("dashboard.navAnnouncementAdmin") : t("dashboard.navAnnouncements")}
        </SidebarLink>
        <SidebarLink href="/settings" icon={Settings} onClick={closeSidebar}>
          {t("dashboard.navSettings")}
        </SidebarLink>
      </nav>
      <Separator />
      <div className="px-2 py-3">
        <LogoutButton />
      </div>
    </>
  );

  return (
    <div
      id="dashboard-theme-root"
      className={`flex min-h-dvh bg-background text-foreground ${initialResolvedTheme === "dark" ? "dark" : ""}`}
      style={initialResolvedTheme ? { colorScheme: initialResolvedTheme } : undefined}
    >
      <script dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript(initialTheme) }} />
      {/* Mobile header bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          aria-label={t("dashboard.menuOpen")}
        >
          <Menu className="size-5" />
        </button>
        <Link href="/boards" className="flex items-center gap-2 font-bold">
          <KeinageLogo className="h-4 w-auto text-foreground" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm">Keinage</span>
            {organizationName && (
              <span className="truncate text-[10px] font-medium text-muted-foreground">
                {t("dashboard.brandFor", { organizationName })}
              </span>
            )}
          </div>
        </Link>
      </header>

      {/* Backdrop overlay (mobile) — animated */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Sidebar: always visible on md+, slide-in overlay on mobile */}
      <aside
        data-open={sidebarOpen}
        className="sidebar-slide fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:z-auto md:h-dvh"
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <AnnouncementBanner />
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
      <OwnerOnboardingDialog
        initialOpen={showOwnerOnboarding}
        billingEnabled={billingEnabled}
      />
    </div>
  );
}
