import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnnouncementType = "info" | "maintenance" | "incident" | "billing" | "legal" | "termination";
export type AnnouncementSeverity = "low" | "medium" | "high" | "critical";

type AnnouncementAppearance = {
  panelClassName: string;
  badgeClassName: string;
  iconShellClassName: string;
  iconGlyphClassName: string;
  labelClassName: string;
  glyph: "info" | "alert" | "yen";
};

const APPEARANCES = {
  info: {
    panelClassName: "border-sky-300 bg-sky-50/95 shadow-[0_12px_28px_-18px_rgba(2,132,199,0.45)] dark:border-sky-900/70 dark:bg-sky-950/35",
    badgeClassName: "border-transparent bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm dark:bg-sky-500",
    iconGlyphClassName: "text-[0.95rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-sky-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-sky-500",
    glyph: "info",
  },
  maintenance: {
    panelClassName: "border-amber-300 bg-amber-50/95 shadow-[0_12px_28px_-18px_rgba(217,119,6,0.45)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm dark:bg-amber-500",
    iconGlyphClassName: "size-4 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-amber-500",
    glyph: "alert",
  },
  incident: {
    panelClassName: "border-red-300 bg-red-50/95 shadow-[0_12px_28px_-18px_rgba(220,38,38,0.45)] dark:border-red-900/70 dark:bg-red-950/35",
    badgeClassName: "border-transparent bg-red-600 text-white shadow-sm dark:bg-red-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm dark:bg-red-500",
    iconGlyphClassName: "size-4 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-red-500",
    glyph: "alert",
  },
  billing: {
    panelClassName: "border-amber-300 bg-amber-50/95 shadow-[0_12px_28px_-18px_rgba(217,119,6,0.45)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm dark:bg-amber-500",
    iconGlyphClassName: "text-[0.95rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-amber-500",
    glyph: "yen",
  },
  legal: {
    panelClassName: "border-amber-300 bg-amber-50/95 shadow-[0_12px_28px_-18px_rgba(217,119,6,0.45)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm dark:bg-amber-500",
    iconGlyphClassName: "text-[0.95rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-amber-500",
    glyph: "info",
  },
  termination: {
    panelClassName: "border-red-300 bg-red-50/95 shadow-[0_12px_28px_-18px_rgba(220,38,38,0.45)] dark:border-red-900/70 dark:bg-red-950/35",
    badgeClassName: "border-transparent bg-red-600 text-white shadow-sm dark:bg-red-500 dark:text-white",
    iconShellClassName: "inline-flex size-8 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm dark:bg-red-500",
    iconGlyphClassName: "size-4 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm dark:bg-red-500",
    glyph: "alert",
  },
} as const satisfies Record<AnnouncementType, AnnouncementAppearance>;

export function getAnnouncementAppearance(type: AnnouncementType) {
  return APPEARANCES[type];
}

export function getRequiredAnnouncementLabelKey(severity: AnnouncementSeverity) {
  switch (severity) {
    case "medium":
      return "announcements.requiredLabel.review";
    case "high":
      return "announcements.requiredLabel.important";
    default:
      return null;
  }
}

export function AnnouncementRequiredMark(input: {
  type: AnnouncementType;
  label?: string | null;
  className?: string;
}) {
  const appearance = getAnnouncementAppearance(input.type);

  return (
    <div className={cn("inline-flex items-center gap-2", input.className)}>
      <span className={appearance.iconShellClassName}>
        {appearance.glyph === "alert" ? (
          <AlertTriangle className={appearance.iconGlyphClassName} />
        ) : (
          <span className={appearance.iconGlyphClassName}>
            {appearance.glyph === "yen" ? "¥" : "i"}
          </span>
        )}
      </span>
      {input.label ? <span className={appearance.labelClassName}>{input.label}</span> : null}
    </div>
  );
}