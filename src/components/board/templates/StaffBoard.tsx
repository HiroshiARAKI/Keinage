"use client";

import { DateTimeClock } from "@/components/board/DateTimeClock";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createStaffBoardDefaultConfig } from "@/lib/template-default-configs";
import type { BoardTemplateProps } from "@/types";

interface StaffProfileConfig {
  imageUrl: string;
  name: string;
  role: string;
  description: string;
  accentColor: string;
}

interface StaffBoardConfig {
  title: string;
  body: string;
  fontFamily: string;
  showClock: boolean;
  objectFit: "contain" | "cover";
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  cardBackgroundColor: string;
  cardTextColor: string;
  profiles: StaffProfileConfig[];
}

const defaultAccentColors = [
  "#dbeafe",
  "#dcfce7",
  "#fef3c7",
  "#fae8ff",
  "#fee2e2",
  "#e0f2fe",
  "#ede9fe",
  "#fde68a",
];

export const staffBoardDefaultConfig: StaffBoardConfig = createStaffBoardDefaultConfig();

function normalizeProfiles(value: unknown, defaultProfiles: StaffProfileConfig[]): StaffProfileConfig[] {
  if (!Array.isArray(value)) return defaultProfiles;
  const profiles = value.slice(0, 8).map((profile, index) => {
    const raw = profile && typeof profile === "object"
      ? (profile as Partial<StaffProfileConfig>)
      : {};
    return {
      imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
      name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "",
      role: typeof raw.role === "string" ? raw.role.slice(0, 60) : "",
      description:
        typeof raw.description === "string" ? raw.description.slice(0, 240) : "",
      accentColor:
        typeof raw.accentColor === "string" && raw.accentColor
          ? raw.accentColor
          : defaultAccentColors[index % defaultAccentColors.length],
    };
  });

  return profiles.length > 0 ? profiles : defaultProfiles;
}

function parseConfig(raw: unknown, defaultConfig: StaffBoardConfig): StaffBoardConfig {
  const config = (raw && typeof raw === "object"
    ? raw
    : {}) as Partial<StaffBoardConfig>;

  const objectFit = config.objectFit === "contain" ? "contain" : "cover";

  return {
    ...defaultConfig,
    ...config,
    objectFit,
    profiles: normalizeProfiles(config.profiles, defaultConfig.profiles),
  };
}

function hasProfileContent(profile: StaffProfileConfig) {
  return Boolean(
    profile.imageUrl ||
      profile.name.trim() ||
      profile.role.trim() ||
      profile.description.trim(),
  );
}

function getLayout(profileCount: number) {
  if (profileCount <= 1) {
    return {
      columns: 1,
      maxWidthClassName: "max-w-4xl",
      imageHeight: "40%",
      titleSize: "38px",
      roleSize: "20px",
      descriptionSize: "20px",
    };
  }
  if (profileCount === 2) {
    return {
      columns: 2,
      maxWidthClassName: "max-w-7xl",
      imageHeight: "36%",
      titleSize: "30px",
      roleSize: "18px",
      descriptionSize: "18px",
    };
  }
  if (profileCount === 3) {
    return {
      columns: 3,
      maxWidthClassName: "max-w-[1800px]",
      imageHeight: "34%",
      titleSize: "26px",
      roleSize: "16px",
      descriptionSize: "16px",
    };
  }
  if (profileCount === 4) {
    return {
      columns: 2,
      maxWidthClassName: "max-w-[1600px]",
      imageHeight: "200px",
      titleSize: "28px",
      roleSize: "16px",
      descriptionSize: "16px",
    };
  }
  if (profileCount <= 6) {
    return {
      columns: 3,
      maxWidthClassName: "max-w-[1800px]",
      imageHeight: "170px",
      titleSize: "24px",
      roleSize: "15px",
      descriptionSize: "15px",
    };
  }
  return {
    columns: 4,
    maxWidthClassName: "max-w-[1900px]",
    imageHeight: "48%",
    titleSize: "21px",
    roleSize: "14px",
    descriptionSize: "14px",
  };
}

function getInitials(profile: StaffProfileConfig) {
  const source = profile.name.trim() || profile.role.trim() || profile.description.trim();
  return source.slice(0, 2) || "ST";
}

export default function StaffBoard({ board }: BoardTemplateProps) {
  const { t } = useLocale();
  const defaultConfig = createStaffBoardDefaultConfig(t);
  const config = parseConfig(board.config, defaultConfig);
  const profiles = config.profiles.filter(hasProfileContent);
  const layout = getLayout(Math.max(1, profiles.length));
  const imageObjectFitClassName =
    config.objectFit === "contain" ? "object-contain" : "object-cover";

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        backgroundColor: config.backgroundColor,
        color: config.cardTextColor,
        fontFamily: config.fontFamily || undefined,
        padding: "32px",
      }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}
      <header className="mx-auto mb-8 flex w-full max-w-[1900px] shrink-0 items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1
            className="text-balance font-black tracking-tight"
            style={{ color: config.titleColor, fontSize: "46px", lineHeight: 1.08 }}
          >
            {config.title || board.name}
          </h1>
          {config.body && (
            <p
              className="mt-2 max-w-5xl leading-relaxed"
              style={{ color: config.bodyColor, fontSize: "20px" }}
            >
              {config.body}
            </p>
          )}
        </div>
        {config.showClock && (
          <div className="shrink-0">
            <DateTimeClock
              timeFontSize={28}
              color={config.titleColor}
              bgOpacity={0}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          </div>
        )}
      </header>

      <div className={`mx-auto flex min-h-0 w-full flex-1 ${layout.maxWidthClassName}`}>
        {profiles.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-[28px] border border-slate-200/70 bg-white/80 px-8 text-center text-slate-500 shadow-sm">
            {t("board.staff.empty")}
          </div>
        ) : (
          <div
            className="grid min-h-0 w-full gap-5"
            style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
          >
            {profiles.map((profile, index) => (
              <article
                key={`${profile.name}-${profile.role}-${index}`}
                className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/70 shadow-sm"
                style={{
                  backgroundColor: config.cardBackgroundColor,
                  color: config.cardTextColor,
                }}
              >
                <div
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    height: layout.imageHeight,
                    backgroundColor: profile.accentColor,
                  }}
                >
                  {profile.imageUrl ? (
                    <img
                      src={profile.imageUrl}
                      alt={profile.name || t("template.staff-board.name")}
                      className={`h-full w-full ${imageObjectFitClassName}`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl font-black tracking-tight text-slate-700/70">
                      {getInitials(profile)}
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
                  <div>
                    <h2
                      className="text-balance font-black tracking-tight"
                      style={{ fontSize: layout.titleSize, lineHeight: 1.12 }}
                    >
                      {profile.name || t("board.staff.nameUnset")}
                    </h2>
                    {profile.role && (
                      <p
                        className="mt-2 font-semibold uppercase tracking-[0.16em] text-slate-500"
                        style={{ fontSize: layout.roleSize }}
                      >
                        {profile.role}
                      </p>
                    )}
                  </div>

                  <p
                    className="min-h-0 leading-relaxed text-slate-600"
                    style={{ fontSize: layout.descriptionSize }}
                  >
                    {profile.description || t("board.staff.descriptionPlaceholder")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
