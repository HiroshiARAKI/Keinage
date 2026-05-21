const CORE_COLOR_KEYS = [
  "backgroundColor",
  "panelColor",
  "titleColor",
  "bodyColor",
  "textColor",
  "floorBadgeColor",
] as const;

type FloorGuideCoreColorKey = (typeof CORE_COLOR_KEYS)[number];

export interface FloorGuideThemePalette {
  key: FloorGuideThemeKey;
  labelKey: string;
  backgroundColor: string;
  panelColor: string;
  titleColor: string;
  bodyColor: string;
  textColor: string;
  floorBadgeColor: string;
  panelBorderColor: string;
  rowBackgroundColor: string;
  rowBorderColor: string;
  emptyTextColor: string;
  shopCardColor: string;
  shopPlaceholderBackgroundColor: string;
  shopPlaceholderColor: string;
  mutedTextColor: string;
  facilityBadgeBackgroundColor: string;
  facilityBadgeBorderColor: string;
  elevatorLabelBackgroundColor: string;
  elevatorLabelTextColor: string;
  elevatorRailColor: string;
  elevatorCabColor: string;
  elevatorCabBorderColor: string;
  elevatorCabTextColor: string;
  elevatorRangeBackgroundColor: string;
  elevatorRangeTextColor: string;
  elevatorRangeBorderColor: string;
}

export const FLOOR_GUIDE_THEME_PRESETS = [
  {
    key: "light",
    labelKey: "configEditor.light",
    backgroundColor: "#f8fafc",
    panelColor: "#ffffff",
    titleColor: "#0f172a",
    bodyColor: "#475569",
    textColor: "#0f172a",
    floorBadgeColor: "#0f172a",
    panelBorderColor: "#cbd5e1",
    rowBackgroundColor: "#f8fafc",
    rowBorderColor: "#cbd5e1",
    emptyTextColor: "#94a3b8",
    shopCardColor: "#e2e8f0",
    shopPlaceholderBackgroundColor: "#cbd5e1",
    shopPlaceholderColor: "#475569",
    mutedTextColor: "#94a3b8",
    facilityBadgeBackgroundColor: "#ffffff",
    facilityBadgeBorderColor: "#cbd5e1",
    elevatorLabelBackgroundColor: "#0f172a",
    elevatorLabelTextColor: "#ffffff",
    elevatorRailColor: "#cbd5e1",
    elevatorCabColor: "#0f172a",
    elevatorCabBorderColor: "#334155",
    elevatorCabTextColor: "#ffffff",
    elevatorRangeBackgroundColor: "#ffffff",
    elevatorRangeTextColor: "#475569",
    elevatorRangeBorderColor: "#cbd5e1",
  },
  {
    key: "dark",
    labelKey: "configEditor.dark",
    backgroundColor: "#0f172a",
    panelColor: "#111827",
    titleColor: "#f8fafc",
    bodyColor: "#cbd5e1",
    textColor: "#f8fafc",
    floorBadgeColor: "#38bdf8",
    panelBorderColor: "#334155",
    rowBackgroundColor: "#1e293b",
    rowBorderColor: "#475569",
    emptyTextColor: "#94a3b8",
    shopCardColor: "#1f2937",
    shopPlaceholderBackgroundColor: "#334155",
    shopPlaceholderColor: "#e2e8f0",
    mutedTextColor: "#94a3b8",
    facilityBadgeBackgroundColor: "#1e293b",
    facilityBadgeBorderColor: "#475569",
    elevatorLabelBackgroundColor: "#f8fafc",
    elevatorLabelTextColor: "#0f172a",
    elevatorRailColor: "#334155",
    elevatorCabColor: "#38bdf8",
    elevatorCabBorderColor: "#7dd3fc",
    elevatorCabTextColor: "#082f49",
    elevatorRangeBackgroundColor: "#111827",
    elevatorRangeTextColor: "#e2e8f0",
    elevatorRangeBorderColor: "#475569",
  },
  {
    key: "natural",
    labelKey: "configEditor.natural",
    backgroundColor: "#f6f1e8",
    panelColor: "#fffaf0",
    titleColor: "#4b3621",
    bodyColor: "#6b5b4a",
    textColor: "#3f3327",
    floorBadgeColor: "#7c5c3b",
    panelBorderColor: "#d7c7ae",
    rowBackgroundColor: "#efe7da",
    rowBorderColor: "#d7c7ae",
    emptyTextColor: "#8f7b63",
    shopCardColor: "#e7dcc8",
    shopPlaceholderBackgroundColor: "#c9b79c",
    shopPlaceholderColor: "#4b3621",
    mutedTextColor: "#8f7b63",
    facilityBadgeBackgroundColor: "#fffaf0",
    facilityBadgeBorderColor: "#d7c7ae",
    elevatorLabelBackgroundColor: "#7c5c3b",
    elevatorLabelTextColor: "#fffaf0",
    elevatorRailColor: "#c9b79c",
    elevatorCabColor: "#8b6b3d",
    elevatorCabBorderColor: "#b9935a",
    elevatorCabTextColor: "#fffaf0",
    elevatorRangeBackgroundColor: "#fffaf0",
    elevatorRangeTextColor: "#6b5b4a",
    elevatorRangeBorderColor: "#d7c7ae",
  },
  {
    key: "classic",
    labelKey: "configEditor.classic",
    backgroundColor: "#f8f5ef",
    panelColor: "#fffdf7",
    titleColor: "#2b1d0e",
    bodyColor: "#5b4b37",
    textColor: "#2b1d0e",
    floorBadgeColor: "#8b1e3f",
    panelBorderColor: "#d6c5a8",
    rowBackgroundColor: "#f3ece0",
    rowBorderColor: "#d6c5a8",
    emptyTextColor: "#8c7a62",
    shopCardColor: "#ebe1cf",
    shopPlaceholderBackgroundColor: "#d3c2a1",
    shopPlaceholderColor: "#4b3a28",
    mutedTextColor: "#8c7a62",
    facilityBadgeBackgroundColor: "#fffdf7",
    facilityBadgeBorderColor: "#d6c5a8",
    elevatorLabelBackgroundColor: "#23402b",
    elevatorLabelTextColor: "#f5ecd8",
    elevatorRailColor: "#bfa88a",
    elevatorCabColor: "#8b1e3f",
    elevatorCabBorderColor: "#c76687",
    elevatorCabTextColor: "#fff5f7",
    elevatorRangeBackgroundColor: "#fffdf7",
    elevatorRangeTextColor: "#5b4b37",
    elevatorRangeBorderColor: "#d6c5a8",
  },
] as const;

export type FloorGuideThemeKey = (typeof FLOOR_GUIDE_THEME_PRESETS)[number]["key"];

function hasCoreColor(
  config: Partial<Record<FloorGuideCoreColorKey, unknown>>,
  key: FloorGuideCoreColorKey,
  value: string,
) {
  return typeof config[key] === "string" && config[key] === value;
}

export function isFloorGuideThemeKey(value: unknown): value is FloorGuideThemeKey {
  return FLOOR_GUIDE_THEME_PRESETS.some((preset) => preset.key === value);
}

export function getFloorGuideThemePreset(value: unknown) {
  return FLOOR_GUIDE_THEME_PRESETS.find((preset) => preset.key === value) ?? FLOOR_GUIDE_THEME_PRESETS[0];
}

export function detectFloorGuideThemePreset(
  config: Partial<Record<FloorGuideCoreColorKey, unknown>>,
) {
  return (
    FLOOR_GUIDE_THEME_PRESETS.find((preset) =>
      CORE_COLOR_KEYS.every((key) => hasCoreColor(config, key, preset[key])),
    ) ?? null
  );
}

export function applyFloorGuideThemePreset(
  config: Record<string, unknown>,
  presetKey: FloorGuideThemeKey,
) {
  const preset = getFloorGuideThemePreset(presetKey);
  return {
    ...config,
    themePreset: preset.key,
    backgroundColor: preset.backgroundColor,
    panelColor: preset.panelColor,
    titleColor: preset.titleColor,
    bodyColor: preset.bodyColor,
    textColor: preset.textColor,
    floorBadgeColor: preset.floorBadgeColor,
  };
}

export function resolveFloorGuideTheme(
  config: Partial<Record<FloorGuideCoreColorKey | "themePreset", unknown>>,
): FloorGuideThemePalette {
  const detectedPreset = detectFloorGuideThemePreset(config);
  const basePreset = getFloorGuideThemePreset(
    isFloorGuideThemeKey(config.themePreset) ? config.themePreset : detectedPreset?.key,
  );

  return {
    ...basePreset,
    backgroundColor:
      typeof config.backgroundColor === "string" && config.backgroundColor
        ? config.backgroundColor
        : basePreset.backgroundColor,
    panelColor:
      typeof config.panelColor === "string" && config.panelColor
        ? config.panelColor
        : basePreset.panelColor,
    titleColor:
      typeof config.titleColor === "string" && config.titleColor
        ? config.titleColor
        : basePreset.titleColor,
    bodyColor:
      typeof config.bodyColor === "string" && config.bodyColor
        ? config.bodyColor
        : basePreset.bodyColor,
    textColor:
      typeof config.textColor === "string" && config.textColor
        ? config.textColor
        : basePreset.textColor,
    floorBadgeColor:
      typeof config.floorBadgeColor === "string" && config.floorBadgeColor
        ? config.floorBadgeColor
        : basePreset.floorBadgeColor,
  };
}