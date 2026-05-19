"use client";

import { DateTimeClock } from "@/components/board/DateTimeClock";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import { resolveFloorGuideTheme, type FloorGuideThemeKey, type FloorGuideThemePalette } from "@/lib/floor-guide-theme";
import escPict from "@/resources/esc-pict.svg";
import exitPict from "@/resources/exit-pict.svg";
import femalePict from "@/resources/female-pict.svg";
import malePict from "@/resources/male-pict.svg";
import type { BoardTemplateProps, MediaItem } from "@/types";

interface FloorShopConfig {
  logoPath: string;
  text: string;
}

interface FloorConfig {
  floorNumber: number;
  shops: FloorShopConfig[];
  hasMensRestroom: boolean;
  hasWomensRestroom: boolean;
  hasEmergencyExit: boolean;
  hasEscalator: boolean;
}

interface ElevatorConfig {
  enabled: boolean;
  label: string;
  startFloor: number;
  endFloor: number;
}

interface FloorGuideConfig {
  title: string;
  body: string;
  fontFamily: string;
  themePreset?: FloorGuideThemeKey | "";
  floorCount: number;
  showClock: boolean;
  backgroundColor: string;
  panelColor: string;
  titleColor: string;
  bodyColor: string;
  textColor: string;
  floorBadgeColor: string;
  floors: FloorConfig[];
  elevators: ElevatorConfig[];
}

function createDefaultFloors(): FloorConfig[] {
  return Array.from({ length: 10 }, (_, index) => {
    const floorNumber = index + 1;
    return {
      floorNumber,
      shops:
        floorNumber === 1
          ? [{ logoPath: "", text: "受付 / 総合案内" }]
          : floorNumber === 2
            ? [{ logoPath: "", text: "クリニックA / 診察室" }]
            : floorNumber === 3
              ? [{ logoPath: "", text: "クリニックB / 検査室" }]
              : floorNumber === 4
                ? [{ logoPath: "", text: "会議室 / オフィス" }]
                : [],
      hasMensRestroom: floorNumber <= 3,
      hasWomensRestroom: floorNumber <= 3,
      hasEmergencyExit: floorNumber <= 4,
      hasEscalator: floorNumber <= 4,
    };
  });
}

const defaultFloors = createDefaultFloors();

export const floorGuideDefaultConfig: FloorGuideConfig = {
  title: "フロアガイド",
  body: "会場案内や店舗情報、館内設備をご案内します。",
  fontFamily: "",
  themePreset: "light",
  floorCount: 4,
  showClock: false,
  backgroundColor: "#f8fafc",
  panelColor: "#ffffff",
  titleColor: "#0f172a",
  bodyColor: "#475569",
  textColor: "#0f172a",
  floorBadgeColor: "#0f172a",
  floors: defaultFloors,
  elevators: [
    { enabled: true, label: "EV A", startFloor: 1, endFloor: 4 },
    { enabled: false, label: "EV B", startFloor: 1, endFloor: 4 },
    { enabled: false, label: "EV C", startFloor: 1, endFloor: 4 },
  ],
};

function normalizeFloorNumber(value: unknown, fallback: number | null) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(10, Math.max(1, next));
}

function inferFloorCount(value: unknown) {
  if (!Array.isArray(value)) return floorGuideDefaultConfig.floorCount;
  const maxFloor = value.reduce<number>((result, item) => {
    const next = item && typeof item === "object"
      ? normalizeFloorNumber((item as Partial<FloorConfig>).floorNumber, null)
      : null;
    return next !== null ? Math.max(result, next) : result;
  }, 0);
  return maxFloor > 0 ? maxFloor : floorGuideDefaultConfig.floorCount;
}

function normalizeFloorCount(value: unknown, fallback: number) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(10, Math.max(1, next));
}

function normalizeFloors(value: unknown): FloorConfig[] {
  const rawFloors = Array.isArray(value) ? value : defaultFloors;

  return defaultFloors.map((fallback, index) => {
    const raw = rawFloors[index] && typeof rawFloors[index] === "object"
      ? (rawFloors[index] as Partial<FloorConfig>)
      : {};
    const shops = Array.isArray(raw.shops)
      ? raw.shops.slice(0, 10).map((shop) => ({
        logoPath: typeof shop?.logoPath === "string" ? shop.logoPath : "",
        text: typeof shop?.text === "string" ? shop.text.slice(0, 60) : "",
      }))
      : fallback.shops;

    return {
      floorNumber: index + 1,
      shops,
      hasMensRestroom:
        typeof raw.hasMensRestroom === "boolean"
          ? raw.hasMensRestroom
          : fallback.hasMensRestroom,
      hasWomensRestroom:
        typeof raw.hasWomensRestroom === "boolean"
          ? raw.hasWomensRestroom
          : fallback.hasWomensRestroom,
      hasEmergencyExit:
        typeof raw.hasEmergencyExit === "boolean"
          ? raw.hasEmergencyExit
          : fallback.hasEmergencyExit,
      hasEscalator:
        typeof raw.hasEscalator === "boolean"
          ? raw.hasEscalator
          : fallback.hasEscalator,
    };
  });
}

function normalizeElevators(value: unknown, floorCount: number): ElevatorConfig[] {
  const rawElevators = Array.isArray(value) ? value : floorGuideDefaultConfig.elevators;

  return floorGuideDefaultConfig.elevators.map((fallback, index) => {
    const raw = rawElevators[index] && typeof rawElevators[index] === "object"
      ? (rawElevators[index] as Partial<ElevatorConfig>)
      : {};
    const first = Math.min(
      floorCount,
      normalizeFloorNumber(raw.startFloor, Math.min(fallback.startFloor, floorCount)) ?? Math.min(fallback.startFloor, floorCount),
    );
    const second = Math.min(
      floorCount,
      normalizeFloorNumber(raw.endFloor, Math.min(fallback.endFloor, floorCount)) ?? Math.min(fallback.endFloor, floorCount),
    );
    const startFloor = Math.min(first, second);
    const endFloor = Math.max(first, second === first ? Math.min(floorCount, first + 1) : second);

    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      label: typeof raw.label === "string" && raw.label ? raw.label.slice(0, 20) : fallback.label,
      startFloor,
      endFloor,
    };
  });
}

function parseConfig(raw: unknown): FloorGuideConfig {
  const config = (raw && typeof raw === "object"
    ? raw
    : {}) as Partial<FloorGuideConfig>;
  const floorCount = normalizeFloorCount(config.floorCount, inferFloorCount(config.floors));

  return {
    ...floorGuideDefaultConfig,
    ...config,
    floorCount,
    floors: normalizeFloors(config.floors),
    elevators: normalizeElevators(config.elevators, floorCount),
  };
}

function enabledShops(floor: FloorConfig) {
  return floor.shops.filter((shop) => shop.text.trim() || shop.logoPath);
}

function findLogoMedia(mediaItems: MediaItem[], logoPath: string) {
  if (!logoPath) return null;
  return mediaItems.find((item) => item.type === "image" && item.filePath === logoPath) ?? null;
}

export default function FloorGuideBoard({ board, mediaItems }: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const theme = resolveFloorGuideTheme(config);
  const floors = config.floors
    .slice(0, config.floorCount)
    .sort((left, right) => right.floorNumber - left.floorNumber);
  const elevators = config.elevators.filter((elevator) => elevator.enabled);
  const rowCount = Math.max(1, floors.length);
  const floorIndexMap = new Map(floors.map((floor, index) => [floor.floorNumber, index]));
  const elevatorCount = Math.max(1, elevators.length);
  const compactRows = rowCount >= 6;
  const denseRows = rowCount >= 8;
  const elevatorLaneWidth = denseRows ? 36 : compactRows ? 44 : 52;
  const elevatorLaneGap = denseRows ? 6 : compactRows ? 8 : 10;
  const elevatorAreaWidth = elevatorCount * elevatorLaneWidth + Math.max(0, elevatorCount - 1) * elevatorLaneGap + (denseRows ? 20 : compactRows ? 24 : 30);
  const boardPaddingRight = elevatorAreaWidth + (denseRows ? 18 : compactRows ? 22 : 28);
  const badgeColumn = denseRows ? "84px" : compactRows ? "92px" : "110px";
  const facilityColumn = denseRows ? "88px" : compactRows ? "100px" : "120px";
  const rowGap = denseRows ? "8px" : compactRows ? "10px" : "12px";
  const rowPaddingX = denseRows ? "12px" : compactRows ? "14px" : "16px";
  const rowPaddingY = denseRows ? "8px" : compactRows ? "10px" : "12px";
  const badgeFontSize = denseRows ? "22px" : compactRows ? "24px" : "28px";
  const shopCardPaddingX = denseRows ? "10px" : compactRows ? "11px" : "12px";
  const shopCardPaddingY = denseRows ? "6px" : compactRows ? "7px" : "8px";
  const shopTextSize = denseRows ? "13px" : compactRows ? "14px" : "16px";
  const shopLogoSize = denseRows ? "32px" : compactRows ? "36px" : "40px";
  const facilitySize = denseRows ? 30 : compactRows ? 34 : 40;
  const facilityIconSize = denseRows ? 18 : compactRows ? 20 : 28;
  const emptyTextSize = denseRows ? "12px" : "14px";

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: config.fontFamily || undefined,
        padding: "28px",
      }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}

      <header className="mb-6 flex shrink-0 items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1
            className="text-balance font-black tracking-tight"
            style={{ color: theme.titleColor, fontSize: "44px", lineHeight: 1.08 }}
          >
            {config.title || board.name}
          </h1>
          {config.body && (
            <p
              className="mt-2 max-w-5xl leading-relaxed"
              style={{ color: theme.bodyColor, fontSize: "20px" }}
            >
              {config.body}
            </p>
          )}
        </div>
        {config.showClock && (
          <div className="shrink-0">
            <DateTimeClock
              timeFontSize={28}
              color={theme.titleColor}
              bgOpacity={0.08}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          </div>
        )}
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 p-4 shadow-sm"
        style={{ backgroundColor: theme.panelColor, borderColor: theme.panelBorderColor }}
      >
        {floors.length === 0 ? (
          <div
            className="flex h-full items-center justify-center text-center"
            style={{ color: theme.emptyTextColor }}
          >
            表示する階数が設定されていません
          </div>
        ) : (
          <>
            <div
              className="grid h-full"
              style={{
                gap: rowGap,
                paddingRight: `${boardPaddingRight}px`,
                gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
              }}
            >
              {floors.map((floor) => {
                const shops = enabledShops(floor);

                return (
                  <section
                    key={floor.floorNumber}
                    className="grid min-h-0 rounded-2xl border shadow-sm"
                    style={{
                      gridTemplateColumns: `${badgeColumn} minmax(0,1fr) ${facilityColumn}`,
                      gap: rowGap,
                      padding: `${rowPaddingY} ${rowPaddingX}`,
                      backgroundColor: theme.rowBackgroundColor,
                      borderColor: theme.rowBorderColor,
                    }}
                  >
                    <div className="flex items-center justify-center">
                      <div
                        className="flex h-full w-full items-center justify-center rounded-xl font-black text-white"
                        style={{ backgroundColor: theme.floorBadgeColor, fontSize: badgeFontSize }}
                      >
                        {floor.floorNumber}F
                      </div>
                    </div>

                    <div className="min-w-0 overflow-hidden">
                      {shops.length > 0 ? (
                        <div
                          className="grid h-full overflow-hidden"
                          style={{
                            gridTemplateColumns:
                              shops.length > 1
                                ? `repeat(${Math.min(3, shops.length)}, minmax(0, 1fr))`
                                : "minmax(0, 1fr)",
                            gap: rowGap,
                          }}
                        >
                          {shops.map((shop, index) => {
                            const logo = findLogoMedia(mediaItems, shop.logoPath);
                            return (
                              <div
                                key={`${shop.text}-${index}`}
                                className="flex min-w-0 items-center rounded-xl border"
                                style={{
                                  gap: denseRows ? "6px" : "8px",
                                  padding: `${shopCardPaddingY} ${shopCardPaddingX}`,
                                  backgroundColor: theme.shopCardColor,
                                  borderColor: theme.rowBorderColor,
                                }}
                              >
                                {logo ? (
                                  <img
                                    src={logo.filePath ?? undefined}
                                    alt=""
                                    className="shrink-0 rounded-lg object-cover"
                                    style={{ width: shopLogoSize, height: shopLogoSize }}
                                  />
                                ) : shop.logoPath ? (
                                  <div
                                    className="flex shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                                    style={{
                                      width: shopLogoSize,
                                      height: shopLogoSize,
                                      backgroundColor: theme.shopPlaceholderBackgroundColor,
                                      color: theme.shopPlaceholderColor,
                                    }}
                                  >
                                    LOGO
                                  </div>
                                ) : null}
                                <span
                                  className="min-w-0 truncate text-base font-semibold"
                                  style={{
                                    color: theme.textColor,
                                    fontSize: shopTextSize,
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {shop.text || "店舗情報未設定"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="flex h-full items-center"
                          style={{ color: theme.mutedTextColor, fontSize: emptyTextSize }}
                        >
                          店舗情報はありません
                        </div>
                      )}
                    </div>

                    <div
                      className="flex flex-wrap content-center items-center justify-end"
                      style={{ gap: denseRows ? "6px" : "8px" }}
                    >
                      {floor.hasMensRestroom && <FacilityBadge iconSrc={malePict.src} alt="男性トイレ" theme={theme} size={facilitySize} iconSize={facilityIconSize} />}
                      {floor.hasWomensRestroom && <FacilityBadge iconSrc={femalePict.src} alt="女性トイレ" theme={theme} size={facilitySize} iconSize={facilityIconSize} />}
                      {floor.hasEscalator && <FacilityBadge iconSrc={escPict.src} alt="エスカレーター" theme={theme} size={facilitySize} iconSize={facilityIconSize} />}
                      {floor.hasEmergencyExit && <FacilityBadge iconSrc={exitPict.src} alt="非常口" theme={theme} size={facilitySize} iconSize={facilityIconSize} />}
                    </div>
                  </section>
                );
              })}
            </div>

            <div
              className="pointer-events-none absolute inset-y-4"
              style={{
                right: denseRows ? "10px" : compactRows ? "14px" : "18px",
                width: `${elevatorAreaWidth}px`,
              }}
            >
              {elevators.map((elevator, index) => (
                <ElevatorOverlay
                  key={`${elevator.label}-${index}`}
                  elevator={elevator}
                  floorIndexMap={floorIndexMap}
                  totalRows={rowCount}
                  laneIndex={index}
                  theme={theme}
                  compact={compactRows}
                  dense={denseRows}
                  laneWidth={elevatorLaneWidth}
                  laneGap={elevatorLaneGap}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FacilityBadge({
  iconSrc,
  alt,
  theme,
  size,
  iconSize,
}: {
  iconSrc: string;
  alt: string;
  theme: FloorGuideThemePalette;
  size: number;
  iconSize: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border shadow-sm"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: theme.facilityBadgeBackgroundColor,
        borderColor: theme.facilityBadgeBorderColor,
      }}
    >
      <img src={iconSrc} alt={alt} className="object-contain" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
    </span>
  );
}

function ElevatorOverlay({
  elevator,
  floorIndexMap,
  totalRows,
  laneIndex,
  theme,
  compact,
  dense,
  laneWidth,
  laneGap,
}: {
  elevator: ElevatorConfig;
  floorIndexMap: Map<number, number>;
  totalRows: number;
  laneIndex: number;
  theme: FloorGuideThemePalette;
  compact: boolean;
  dense: boolean;
  laneWidth: number;
  laneGap: number;
}) {
  const coveredFloors = Array.from(floorIndexMap.keys())
    .filter((floor) => floor >= elevator.startFloor && floor <= elevator.endFloor)
    .sort((left, right) => right - left);

  if (coveredFloors.length < 2) return null;

  const highestFloor = coveredFloors[0];
  const lowestFloor = coveredFloors[coveredFloors.length - 1];
  const topIndex = floorIndexMap.get(highestFloor);
  const bottomIndex = floorIndexMap.get(lowestFloor);
  if (topIndex === undefined || bottomIndex === undefined) return null;

  const laneLeft = laneIndex * (laneWidth + laneGap);
  const rowHeight = 100 / totalRows;
  const top = topIndex * rowHeight + rowHeight * 0.08;
  const bottom = (bottomIndex + 1) * rowHeight - rowHeight * 0.08;
  const height = Math.max(12, bottom - top);
  const shaftInsetX = dense ? 4 : compact ? 5 : 6;
  const shaftRadius = dense ? 16 : compact ? 18 : 22;
  const labelInsetX = dense ? 1 : compact ? 2 : 3;
  const labelHeight = dense ? 28 : compact ? 34 : 42;
  const labelRadius = dense ? 10 : compact ? 12 : 16;
  const labelFontSize = dense ? "10px" : compact ? "11px" : "13px";
  const labelPaddingX = dense ? "4px" : compact ? "6px" : "8px";

  return (
    <div
      className="absolute"
      style={{
        left: `${laneLeft}px`,
        top: `${top}%`,
        height: `${height}%`,
        width: `${laneWidth}px`,
      }}
    >
      <div
        className="absolute border shadow-sm"
        style={{
          left: `${shaftInsetX}px`,
          right: `${shaftInsetX}px`,
          top: 0,
          bottom: 0,
          borderRadius: `${shaftRadius}px`,
          borderColor: theme.elevatorCabBorderColor,
          backgroundColor: theme.elevatorRailColor,
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 border shadow-sm"
        style={{
          left: `${labelInsetX}px`,
          right: `${labelInsetX}px`,
          height: `${labelHeight}px`,
          borderRadius: `${labelRadius}px`,
          backgroundColor: theme.panelColor,
          borderColor: theme.elevatorCabBorderColor,
        }}
      >
        <div
          className="flex h-full items-center justify-center font-black"
          style={{
            borderRadius: `${Math.max(8, labelRadius - 2)}px`,
            fontSize: labelFontSize,
            padding: `0 ${labelPaddingX}`,
            whiteSpace: "nowrap",
            backgroundColor: theme.elevatorCabColor,
            color: theme.elevatorCabTextColor,
          }}
        >
          {elevator.label}
        </div>
      </div>
    </div>
  );
}