import { AlertTriangle, BadgeInfo, BadgeJapaneseYen } from "lucide-react";
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
    panelClassName: "border-sky-400 bg-sky-50/92 shadow-[0_12px_28px_-20px_rgba(3,105,161,0.28)] dark:border-sky-900/70 dark:bg-sky-950/35",
    badgeClassName: "border-transparent bg-sky-700 text-white shadow-sm dark:bg-sky-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm dark:bg-sky-600",
    iconGlyphClassName: "text-[0.85rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-sky-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-sky-600",
    glyph: "info",
  },
  maintenance: {
    panelClassName: "border-amber-400 bg-amber-50/92 shadow-[0_12px_28px_-20px_rgba(180,83,9,0.28)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600",
    iconGlyphClassName: "size-3.5 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-amber-600",
    glyph: "alert",
  },
  incident: {
    panelClassName: "border-red-400 bg-red-50/92 shadow-[0_12px_28px_-20px_rgba(185,28,28,0.28)] dark:border-red-900/70 dark:bg-red-950/35",
    badgeClassName: "border-transparent bg-red-700 text-white shadow-sm dark:bg-red-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-red-700 text-white shadow-sm dark:bg-red-600",
    iconGlyphClassName: "size-3.5 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-red-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-red-600",
    glyph: "alert",
  },
  billing: {
    panelClassName: "border-amber-400 bg-amber-50/92 shadow-[0_12px_28px_-20px_rgba(180,83,9,0.28)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600",
    iconGlyphClassName: "text-[0.85rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-amber-600",
    glyph: "yen",
  },
  legal: {
    panelClassName: "border-amber-400 bg-amber-50/92 shadow-[0_12px_28px_-20px_rgba(180,83,9,0.28)] dark:border-amber-900/70 dark:bg-amber-950/35",
    badgeClassName: "border-transparent bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600",
    iconGlyphClassName: "text-[0.85rem] font-black leading-none text-white",
    labelClassName: "inline-flex items-center rounded-full bg-amber-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-amber-600",
    glyph: "info",
  },
  termination: {
    panelClassName: "border-red-400 bg-red-50/92 shadow-[0_12px_28px_-20px_rgba(185,28,28,0.28)] dark:border-red-900/70 dark:bg-red-950/35",
    badgeClassName: "border-transparent bg-red-700 text-white shadow-sm dark:bg-red-600 dark:text-white",
    iconShellClassName: "inline-flex size-7 items-center justify-center rounded-xl bg-red-700 text-white shadow-sm dark:bg-red-600",
    iconGlyphClassName: "size-3.5 text-white",
    labelClassName: "inline-flex items-center rounded-full bg-red-700 px-2.5 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm dark:bg-red-600",
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
        {appearance.glyph === "alert" ? <AlertTriangle className={appearance.iconGlyphClassName} /> : null}
        {appearance.glyph === "info" ? <BadgeInfo className={appearance.iconGlyphClassName} /> : null}
        {appearance.glyph === "yen" ? <BadgeJapaneseYen className={appearance.iconGlyphClassName} /> : null}
      </span>
      {input.label ? <span className={appearance.labelClassName}>{input.label}</span> : null}
    </div>
  );
}