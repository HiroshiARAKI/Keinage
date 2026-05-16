"use client";

import { DateTimeClock } from "@/components/board/DateTimeClock";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
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
  floorNumber: number | null;
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
    const floorNumber = index < 4 ? index + 1 : null;
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
      hasMensRestroom: floorNumber !== null && floorNumber <= 3,
      hasWomensRestroom: floorNumber !== null && floorNumber <= 3,
      hasEmergencyExit: floorNumber !== null && floorNumber <= 4,
      hasEscalator: floorNumber !== null && floorNumber <= 4,
    };
  });
}

const defaultFloors = createDefaultFloors();

export const floorGuideDefaultConfig: FloorGuideConfig = {
  title: "フロアガイド",
  body: "会場案内や店舗情報、館内設備をご案内します。",
  fontFamily: "",
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
      floorNumber: normalizeFloorNumber(raw.floorNumber, fallback.floorNumber),
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

function normalizeElevators(value: unknown): ElevatorConfig[] {
  const rawElevators = Array.isArray(value) ? value : floorGuideDefaultConfig.elevators;

  return floorGuideDefaultConfig.elevators.map((fallback, index) => {
    const raw = rawElevators[index] && typeof rawElevators[index] === "object"
      ? (rawElevators[index] as Partial<ElevatorConfig>)
      : {};
    const first = normalizeFloorNumber(raw.startFloor, fallback.startFloor) ?? fallback.startFloor;
    const second = normalizeFloorNumber(raw.endFloor, fallback.endFloor) ?? fallback.endFloor;
    const startFloor = Math.min(first, second);
    const endFloor = Math.max(first, second === first ? Math.min(10, first + 1) : second);

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

  return {
    ...floorGuideDefaultConfig,
    ...config,
    floors: normalizeFloors(config.floors),
    elevators: normalizeElevators(config.elevators),
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
  const floors = config.floors
    .filter((floor): floor is FloorConfig & { floorNumber: number } => floor.floorNumber !== null)
    .sort((left, right) => right.floorNumber - left.floorNumber);
  const elevators = config.elevators.filter((elevator) => elevator.enabled);
  const rowCount = Math.max(1, floors.length);
  const floorIndexMap = new Map(floors.map((floor, index) => [floor.floorNumber, index]));

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        backgroundColor: config.backgroundColor,
        color: config.textColor,
        fontFamily: config.fontFamily || undefined,
        padding: "28px",
      }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}

      <header className="mb-6 flex shrink-0 items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1
            className="text-balance font-black tracking-tight"
            style={{ color: config.titleColor, fontSize: "44px", lineHeight: 1.08 }}
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
              bgOpacity={0.08}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          </div>
        )}
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 p-4 shadow-sm"
        style={{ backgroundColor: config.panelColor }}
      >
        {floors.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400">
            表示する階数が設定されていません
          </div>
        ) : (
          <>
            <div
              className="grid h-full gap-3 pr-36"
              style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
            >
              {floors.map((floor) => {
                const shops = enabledShops(floor);

                return (
                  <section
                    key={floor.floorNumber}
                    className="grid min-h-0 grid-cols-[110px_minmax(0,1fr)_120px] gap-4 rounded-2xl border border-slate-200/70 px-4 py-3 shadow-sm"
                    style={{ backgroundColor: config.backgroundColor }}
                  >
                    <div className="flex items-center justify-center">
                      <div
                        className="flex h-full w-full items-center justify-center rounded-xl font-black text-white"
                        style={{ backgroundColor: config.floorBadgeColor, fontSize: "28px" }}
                      >
                        {floor.floorNumber}F
                      </div>
                    </div>

                    <div className="min-w-0 overflow-hidden">
                      {shops.length > 0 ? (
                        <div className="grid h-full grid-cols-2 gap-2 overflow-hidden">
                          {shops.map((shop, index) => {
                            const logo = findLogoMedia(mediaItems, shop.logoPath);
                            return (
                              <div
                                key={`${shop.text}-${index}`}
                                className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-100/80 px-3 py-2"
                              >
                                {logo ? (
                                  <img
                                    src={logo.filePath ?? undefined}
                                    alt=""
                                    className="size-10 shrink-0 rounded-lg object-cover"
                                  />
                                ) : shop.logoPath ? (
                                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500">
                                    LOGO
                                  </div>
                                ) : null}
                                <span className="min-w-0 truncate text-base font-semibold">
                                  {shop.text || "店舗情報未設定"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex h-full items-center text-sm text-slate-400">
                          店舗情報はありません
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap content-center items-center justify-end gap-2">
                      {floor.hasMensRestroom && <FacilityBadge iconSrc={malePict.src} alt="男性トイレ" />}
                      {floor.hasWomensRestroom && <FacilityBadge iconSrc={femalePict.src} alt="女性トイレ" />}
                      {floor.hasEscalator && <FacilityBadge iconSrc={escPict.src} alt="エスカレーター" />}
                      {floor.hasEmergencyExit && <FacilityBadge iconSrc={exitPict.src} alt="非常口" />}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="pointer-events-none absolute inset-y-4 right-6 w-24">
              {elevators.map((elevator, index) => (
                <ElevatorOverlay
                  key={`${elevator.label}-${index}`}
                  elevator={elevator}
                  floorIndexMap={floorIndexMap}
                  totalRows={rowCount}
                  laneIndex={index}
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
}: {
  iconSrc: string;
  alt: string;
}) {
  return (
    <span className="inline-flex size-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80">
      <img src={iconSrc} alt={alt} className="size-7 object-contain" />
    </span>
  );
}

function ElevatorOverlay({
  elevator,
  floorIndexMap,
  totalRows,
  laneIndex,
}: {
  elevator: ElevatorConfig;
  floorIndexMap: Map<number, number>;
  totalRows: number;
  laneIndex: number;
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

  const laneLeft = 6 + laneIndex * 26;
  const rowHeight = 100 / totalRows;
  const top = topIndex * rowHeight + rowHeight * 0.16;
  const bottom = (bottomIndex + 1) * rowHeight - rowHeight * 0.16;
  const height = Math.max(12, bottom - top);

  return (
    <div
      className="absolute"
      style={{
        left: `${laneLeft}px`,
        top: `${top}%`,
        height: `${height}%`,
        width: "20px",
      }}
    >
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          {elevator.label}
        </span>
      </div>
      <div className="absolute inset-x-[7px] top-6 bottom-6 rounded-full bg-slate-800/20" />
      <div className="absolute inset-x-[4px] top-1/2 h-8 -translate-y-1/2 rounded-md border border-slate-700/20 bg-white shadow-sm">
        <div className="flex h-full items-center justify-center rounded-md bg-slate-900 text-[10px] font-black text-white">
          EV
        </div>
      </div>
      <div className="absolute inset-x-[2px] bottom-0 flex justify-center">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200/80">
          {elevator.startFloor}F-{elevator.endFloor}F
        </span>
      </div>
    </div>
  );
}