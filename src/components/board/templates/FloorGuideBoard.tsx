"use client";

import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps, MediaItem } from "@/types";

interface FloorShopConfig {
  logoPath: string;
  text: string;
}

interface FloorConfig {
  floorNumber: number;
  enabled: boolean;
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
      enabled: floorNumber <= 4,
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

function normalizeFloorNumber(value: unknown, fallback: number) {
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
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
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
    const first = normalizeFloorNumber(raw.startFloor, fallback.startFloor);
    const second = normalizeFloorNumber(raw.endFloor, fallback.endFloor);
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
  const floors = [...config.floors].sort((left, right) => right.floorNumber - left.floorNumber);
  const elevators = config.elevators.filter((elevator) => elevator.enabled);

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

      <header className="mb-6 shrink-0">
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
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateRows: "repeat(10, minmax(0, 1fr))" }}>
          {floors.map((floor) => {
            const shops = enabledShops(floor);

            return (
              <section
                key={floor.floorNumber}
                className="grid min-h-0 grid-cols-[110px_minmax(0,1fr)_220px] gap-4 rounded-2xl border border-slate-200/70 px-4 py-3 shadow-sm"
                style={{
                  backgroundColor: config.panelColor,
                  opacity: floor.enabled ? 1 : 0.35,
                }}
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
                  {floor.enabled ? (
                    shops.length > 0 ? (
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
                    )
                  ) : (
                    <div className="flex h-full items-center text-sm text-slate-400">
                      非表示
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap content-center items-center gap-2">
                  {floor.enabled && floor.hasMensRestroom && <FacilityBadge label="M WC" />}
                  {floor.enabled && floor.hasWomensRestroom && <FacilityBadge label="W WC" />}
                  {floor.enabled && floor.hasEscalator && <FacilityBadge label="ESC" />}
                  {floor.enabled && floor.hasEmergencyExit && <EmergencyExitBadge />}
                </div>
              </section>
            );
          })}
        </div>

        <aside
          className="flex w-72 shrink-0 flex-col gap-3 rounded-[28px] border border-slate-200/70 p-4 shadow-sm"
          style={{ backgroundColor: config.panelColor }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Elevator
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">エレベーター案内</h2>
          </div>

          <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
            {floorGuideDefaultConfig.elevators.map((fallback, index) => {
              const elevator = elevators[index];
              return elevator ? (
                <div key={elevator.label} className="flex min-h-0 flex-col rounded-2xl bg-slate-100/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                      {elevator.label}
                    </span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                      {elevator.startFloor}F - {elevator.endFloor}F
                    </span>
                  </div>
                  <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl bg-white px-3 py-4">
                    <div className="flex w-full items-center justify-between gap-2">
                      <FloorPill floor={elevator.endFloor} />
                      <div className="h-1 flex-1 rounded-full bg-slate-300" />
                      <FloorPill floor={elevator.startFloor} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    対応階: {servedFloorsLabel(elevator.startFloor, elevator.endFloor)}
                  </p>
                </div>
              ) : (
                <div
                  key={fallback.label}
                  className="flex min-h-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 text-center text-sm text-slate-400"
                >
                  {fallback.label} は未設定です
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FloorPill({ floor }: { floor: number }) {
  return (
    <span className="inline-flex min-w-14 items-center justify-center rounded-full bg-slate-900 px-3 py-2 text-sm font-bold text-white">
      {floor}F
    </span>
  );
}

function servedFloorsLabel(startFloor: number, endFloor: number) {
  return Array.from(
    { length: endFloor - startFloor + 1 },
    (_, index) => `${startFloor + index}F`,
  ).join(" / ");
}

function FacilityBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
      {label}
    </span>
  );
}

function EmergencyExitBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
      <EmergencyExitIcon />
      EXIT
    </span>
  );
}

function EmergencyExitIcon() {
  return (
    <svg viewBox="0 0 40 24" className="h-4 w-6" aria-hidden>
      <rect x="0" y="0" width="40" height="24" rx="4" fill="currentColor" opacity="0.2" />
      <path d="M6 12h9" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="m11 8 4 4-4 4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="7" r="2" fill="white" />
      <path d="M24 10v4l-3 3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m24 14 5 4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m21 18 4-3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}