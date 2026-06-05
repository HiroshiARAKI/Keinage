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
    panelClassName: "border-sky-200 bg-sky-50/90 dark:border-sky-900/60 dark:bg-sky-950/30",
    badgeClassName: "border-sky-300/80 bg-sky-100/70 text-sky-900 dark:border-sky-800 dark:bg-sky-900/50 dark:text-sky-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/60 dark:text-sky-100",
    iconGlyphClassName: "text-sm font-bold leading-none",
    labelClassName: "inline-flex items-center rounded-full border border-sky-300 bg-sky-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/60 dark:text-sky-100",
    glyph: "info",
  },
  maintenance: {
    panelClassName: "border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30",
    badgeClassName: "border-amber-300/80 bg-amber-100/70 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    iconGlyphClassName: "size-4",
    labelClassName: "inline-flex items-center rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    glyph: "alert",
  },
  incident: {
    panelClassName: "border-red-200 bg-red-50/90 dark:border-red-900/60 dark:bg-red-950/30",
    badgeClassName: "border-red-300/80 bg-red-100/70 text-red-900 dark:border-red-800 dark:bg-red-900/50 dark:text-red-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/60 dark:text-red-100",
    iconGlyphClassName: "size-4",
    labelClassName: "inline-flex items-center rounded-full border border-red-300 bg-red-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/60 dark:text-red-100",
    glyph: "alert",
  },
  billing: {
    panelClassName: "border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30",
    badgeClassName: "border-amber-300/80 bg-amber-100/70 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    iconGlyphClassName: "text-sm font-bold leading-none",
    labelClassName: "inline-flex items-center rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    glyph: "yen",
  },
  legal: {
    panelClassName: "border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30",
    badgeClassName: "border-amber-300/80 bg-amber-100/70 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    iconGlyphClassName: "text-sm font-bold leading-none",
    labelClassName: "inline-flex items-center rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-100",
    glyph: "info",
  },
  termination: {
    panelClassName: "border-red-200 bg-red-50/90 dark:border-red-900/60 dark:bg-red-950/30",
    badgeClassName: "border-red-300/80 bg-red-100/70 text-red-900 dark:border-red-800 dark:bg-red-900/50 dark:text-red-100",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-full border border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/60 dark:text-red-100",
    iconGlyphClassName: "size-4",
    labelClassName: "inline-flex items-center rounded-full border border-red-300 bg-red-100/80 px-2 py-0.5 text-[0.7rem] font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/60 dark:text-red-100",
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
    case "critical":
      return "announcements.requiredLabel.discontinued";
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