import { translate, type SupportedLocale } from "@/lib/i18n";

type TemplateTranslator = (
  key: Parameters<typeof translate>[1],
  vars?: Record<string, string | number>,
) => string;

const defaultTemplateTranslator: TemplateTranslator = (key, vars) =>
  translate("ja-JP", key, vars);

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

export function createScheduleBoardDefaultConfig(t: TemplateTranslator = defaultTemplateTranslator) {
  return {
    title: t("templateDefaults.schedule.title"),
    body: t("templateDefaults.schedule.body"),
    displayStartTime: "08:00",
    displayEndTime: "18:00",
    fontFamily: "",
    showClock: false,
    backgroundColor: "#f8fafc",
    titleColor: "#0f172a",
    bodyColor: "#475569",
    timeLabelColor: "#334155",
    gridColor: "#cbd5e1",
    cardTextColor: "#0f172a",
    entries: [
      {
        content: t("templateDefaults.schedule.entryMorningBriefing"),
        startTime: "09:00",
        endTime: "09:30",
        color: "#dbeafe",
      },
      {
        content: t("templateDefaults.schedule.entryRegularMeeting"),
        startTime: "10:00",
        endTime: "11:00",
        color: "#dcfce7",
      },
      {
        content: t("templateDefaults.schedule.entryCustomerSupport"),
        startTime: "13:30",
        endTime: "14:30",
        color: "#fef3c7",
      },
    ],
  };
}

export function createStaffBoardDefaultConfig(t: TemplateTranslator = defaultTemplateTranslator) {
  return {
    title: t("templateDefaults.staff.title"),
    body: t("templateDefaults.staff.body"),
    fontFamily: "",
    showClock: false,
    objectFit: "cover" as "contain" | "cover",
    backgroundColor: "#f8fafc",
    titleColor: "#0f172a",
    bodyColor: "#475569",
    cardBackgroundColor: "#ffffff",
    cardTextColor: "#0f172a",
    profiles: [
      {
        imageUrl: "",
        name: t("templateDefaults.staff.profile1Name"),
        role: t("templateDefaults.staff.profile1Role"),
        description: t("templateDefaults.staff.profile1Description"),
        accentColor: defaultAccentColors[0],
      },
      {
        imageUrl: "",
        name: t("templateDefaults.staff.profile2Name"),
        role: t("templateDefaults.staff.profile2Role"),
        description: t("templateDefaults.staff.profile2Description"),
        accentColor: defaultAccentColors[1],
      },
      {
        imageUrl: "",
        name: t("templateDefaults.staff.profile3Name"),
        role: t("templateDefaults.staff.profile3Role"),
        description: t("templateDefaults.staff.profile3Description"),
        accentColor: defaultAccentColors[2],
      },
    ],
  };
}

export function createSplitViewDefaultConfig(t: TemplateTranslator = defaultTemplateTranslator) {
  return {
    splitDirection: "horizontal" as "horizontal" | "vertical",
    dividerColor: "#e2e8f0",
    fontFamily: "",
    showClock: false,
    panes: [
      {
        type: "text" as const,
        title: t("templateDefaults.split.pane1Title"),
        body: t("templateDefaults.split.pane1Body"),
        mediaPath: "",
        backgroundColor: "#0f172a",
        textColor: "#f8fafc",
      },
      {
        type: "image" as const,
        title: "",
        body: "",
        mediaPath: "",
        backgroundColor: "#e2e8f0",
        textColor: "#0f172a",
      },
    ],
  };
}

export function createFloorGuideDefaultFloors(t: TemplateTranslator = defaultTemplateTranslator) {
  return Array.from({ length: 10 }, (_, index) => {
    const floorNumber = index + 1;
    return {
      floorNumber,
      shops:
        floorNumber === 1
          ? [{ logoPath: "", text: t("templateDefaults.floorGuide.floor1Shop") }]
          : floorNumber === 2
            ? [{ logoPath: "", text: t("templateDefaults.floorGuide.floor2Shop") }]
            : floorNumber === 3
              ? [{ logoPath: "", text: t("templateDefaults.floorGuide.floor3Shop") }]
              : floorNumber === 4
                ? [{ logoPath: "", text: t("templateDefaults.floorGuide.floor4Shop") }]
                : [],
      hasMensRestroom: floorNumber <= 3,
      hasWomensRestroom: floorNumber <= 3,
      hasEmergencyExit: floorNumber <= 4,
      hasEscalator: floorNumber <= 4,
    };
  });
}

export function createFloorGuideDefaultElevators() {
  return [
    { enabled: true, label: "EV A", startFloor: 1, endFloor: 4 },
    { enabled: false, label: "EV B", startFloor: 1, endFloor: 4 },
    { enabled: false, label: "EV C", startFloor: 1, endFloor: 4 },
  ];
}

export function createFloorGuideDefaultConfig(t: TemplateTranslator = defaultTemplateTranslator) {
  return {
    title: t("templateDefaults.floorGuide.title"),
    body: t("templateDefaults.floorGuide.body"),
    fontFamily: "",
    themePreset: "light" as const,
    floorCount: 4,
    showClock: false,
    backgroundColor: "#f8fafc",
    panelColor: "#ffffff",
    titleColor: "#0f172a",
    bodyColor: "#475569",
    textColor: "#0f172a",
    floorBadgeColor: "#0f172a",
    floors: createFloorGuideDefaultFloors(t),
    elevators: createFloorGuideDefaultElevators(),
  };
}

export function createLocalizedTemplateDefaultConfig(
  templateId: string,
  locale: SupportedLocale,
) {
  const t: TemplateTranslator = (key, vars) => translate(locale, key, vars);

  switch (templateId) {
    case "schedule-board":
      return createScheduleBoardDefaultConfig(t) as Record<string, unknown>;
    case "staff-board":
      return createStaffBoardDefaultConfig(t) as Record<string, unknown>;
    case "split-view":
      return createSplitViewDefaultConfig(t) as Record<string, unknown>;
    case "floor-guide":
      return createFloorGuideDefaultConfig(t) as Record<string, unknown>;
    default:
      return null;
  }
}
