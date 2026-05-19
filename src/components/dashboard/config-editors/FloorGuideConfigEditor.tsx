"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  FLOOR_GUIDE_THEME_PRESETS,
  applyFloorGuideThemePreset,
  detectFloorGuideThemePreset,
  isFloorGuideThemeKey,
} from "@/lib/floor-guide-theme";
import type { MediaItem } from "@/types";
import { FontSelect, useLoadAllGoogleFonts } from "./shared";

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

interface FloorGuideConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
}

function createDefaultFloors(): FloorConfig[] {
  return Array.from({ length: 10 }, (_, index) => ({
    floorNumber: index + 1,
    shops: index < 4 ? [{ logoPath: "", text: `フロア ${index + 1} の案内` }] : [],
    hasMensRestroom: index < 3,
    hasWomensRestroom: index < 3,
    hasEmergencyExit: index < 4,
    hasEscalator: index < 4,
  }));
}

const defaultFloors = createDefaultFloors();
const defaultElevators: ElevatorConfig[] = [
  { enabled: true, label: "EV A", startFloor: 1, endFloor: 4 },
  { enabled: false, label: "EV B", startFloor: 1, endFloor: 4 },
  { enabled: false, label: "EV C", startFloor: 1, endFloor: 4 },
];

function clampFloorCount(value: unknown, fallback = 4) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(10, Math.max(1, next));
}

function inferFloorCount(value: unknown) {
  if (!Array.isArray(value)) return 4;
  const maxFloor = value.reduce<number>((result, item) => {
    const next = item && typeof item === "object"
      ? clampFloor((item as Partial<FloorConfig>).floorNumber, null)
      : null;
    return next !== null ? Math.max(result, next) : result;
  }, 0);
  return maxFloor > 0 ? maxFloor : 4;
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
        text: typeof shop?.text === "string" ? shop.text : "",
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
  const rawElevators = Array.isArray(value) ? value : defaultElevators;

  return defaultElevators.map((fallback, index) => {
    const raw = rawElevators[index] && typeof rawElevators[index] === "object"
      ? (rawElevators[index] as Partial<ElevatorConfig>)
      : {};

    const first = Math.min(
      floorCount,
      clampFloor(raw.startFloor, Math.min(fallback.startFloor, floorCount)) ?? Math.min(fallback.startFloor, floorCount),
    );
    const second = Math.min(
      floorCount,
      clampFloor(raw.endFloor, Math.min(fallback.endFloor, floorCount)) ?? Math.min(fallback.endFloor, floorCount),
    );
    const startFloor = Math.min(first, second);
    const endFloor = Math.max(first, second === first ? Math.min(floorCount, first + 1) : second);

    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      label: typeof raw.label === "string" && raw.label ? raw.label : fallback.label,
      startFloor,
      endFloor,
    };
  });
}

function clampFloor(value: unknown, fallback: number | null) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(10, Math.max(1, next));
}

export function FloorGuideConfigEditor({
  config,
  onChange,
  mediaItems = [],
}: FloorGuideConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const updateConfig = onChange as Dispatch<SetStateAction<Record<string, unknown>>>;
  const floorCount = clampFloorCount(config.floorCount, inferFloorCount(config.floors));
  const floors = normalizeFloors(config.floors);
  const visibleFloors = floors.slice(0, floorCount);
  const elevators = normalizeElevators(config.elevators, floorCount);
  const fontFamily = (config.fontFamily as string) ?? "";
  const showClock = (config.showClock as boolean) ?? false;
  const activeTheme = detectFloorGuideThemePreset(config) ??
    (isFloorGuideThemeKey(config.themePreset)
      ? FLOOR_GUIDE_THEME_PRESETS.find((preset) => preset.key === config.themePreset) ?? null
      : null);
  const imageMedia = mediaItems.filter(
    (item): item is MediaItem & { filePath: string } =>
      item.type === "image" && typeof item.filePath === "string" && item.filePath.length > 0,
  );

  function update(key: string, value: unknown) {
    updateConfig((currentConfig) => ({ ...currentConfig, [key]: value }));
  }

  function updateFloorCount(value: unknown) {
    updateConfig((currentConfig) => {
      const currentFloorCount = clampFloorCount(
        currentConfig.floorCount,
        inferFloorCount(currentConfig.floors),
      );
      const nextFloorCount = clampFloorCount(value, currentFloorCount);

      return {
        ...currentConfig,
        floorCount: nextFloorCount,
        elevators: normalizeElevators(currentConfig.elevators, nextFloorCount),
      };
    });
  }

  function applyPreset(presetKey: (typeof FLOOR_GUIDE_THEME_PRESETS)[number]["key"]) {
    updateConfig((currentConfig) => applyFloorGuideThemePreset(currentConfig, presetKey));
  }

  function updateFloor(index: number, patch: Partial<FloorConfig>) {
    updateConfig((currentConfig) => {
      const currentFloors = normalizeFloors(currentConfig.floors);

      return {
        ...currentConfig,
        floors: currentFloors.map((floor, floorIndex) =>
          floorIndex === index ? { ...floor, ...patch } : floor,
        ),
      };
    });
  }

  function updateShop(floorIndex: number, shopIndex: number, patch: Partial<FloorShopConfig>) {
    updateConfig((currentConfig) => {
      const currentFloors = normalizeFloors(currentConfig.floors);

      return {
        ...currentConfig,
        floors: currentFloors.map((floor, index) =>
          index === floorIndex
            ? {
                ...floor,
                shops: floor.shops.map((shop, currentShopIndex) =>
                  currentShopIndex === shopIndex ? { ...shop, ...patch } : shop,
                ),
              }
            : floor,
        ),
      };
    });
  }

  function addShop(floorIndex: number) {
    updateConfig((currentConfig) => {
      const currentFloors = normalizeFloors(currentConfig.floors);
      if (currentFloors[floorIndex].shops.length >= 10) return currentConfig;

      return {
        ...currentConfig,
        floors: currentFloors.map((floor, index) =>
          index === floorIndex
            ? {
                ...floor,
                shops: [...floor.shops, { logoPath: "", text: "" }],
              }
            : floor,
        ),
      };
    });
  }

  function removeShop(floorIndex: number, shopIndex: number) {
    updateConfig((currentConfig) => {
      const currentFloors = normalizeFloors(currentConfig.floors);

      return {
        ...currentConfig,
        floors: currentFloors.map((floor, index) =>
          index === floorIndex
            ? {
                ...floor,
                shops: floor.shops.filter((_, currentShopIndex) => currentShopIndex !== shopIndex),
              }
            : floor,
        ),
      };
    });
  }

  function updateElevator(index: number, patch: Partial<ElevatorConfig>) {
    updateConfig((currentConfig) => {
      const currentFloorCount = clampFloorCount(
        currentConfig.floorCount,
        inferFloorCount(currentConfig.floors),
      );
      const currentElevators = normalizeElevators(currentConfig.elevators, currentFloorCount);
      const nextElevators = currentElevators.map((elevator, elevatorIndex) =>
        elevatorIndex === index ? { ...elevator, ...patch } : elevator,
      );

      return {
        ...currentConfig,
        elevators: normalizeElevators(nextElevators, currentFloorCount),
      };
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-floor-title">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-floor-title"
            value={(config.title as string) ?? "フロアガイド"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <FontSelect
          id="cfg-floor-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-floor-body">{t("configEditor.bodyText")}</Label>
        <Textarea
          id="cfg-floor-body"
          rows={3}
          value={(config.body as string) ?? "会場案内や店舗情報、館内設備をご案内します。"}
          onChange={(e) => update("body", e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <Switch
          id="cfg-floor-showClock"
          checked={showClock}
          onCheckedChange={(value) => update("showClock", value)}
        />
        <Label htmlFor="cfg-floor-showClock">{t("configEditor.showClock")}</Label>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold">{t("configEditor.colorPresets")}</h4>
        <div className="flex flex-wrap gap-2">
          {FLOOR_GUIDE_THEME_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant={activeTheme?.key === preset.key ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(preset.key)}
              className="gap-2"
            >
              <span
                className="inline-flex items-center gap-1"
                aria-hidden="true"
              >
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: preset.backgroundColor }}
                />
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: preset.floorBadgeColor }}
                />
              </span>
              {t(preset.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorInput
          id="cfg-floor-bg"
          label="背景色"
          value={(config.backgroundColor as string) ?? "#f8fafc"}
          onChange={(value) => update("backgroundColor", value)}
        />
        <ColorInput
          id="cfg-floor-panel"
          label="パネル色"
          value={(config.panelColor as string) ?? "#ffffff"}
          onChange={(value) => update("panelColor", value)}
        />
        <ColorInput
          id="cfg-floor-title-color"
          label={t("configEditor.titleColor")}
          value={(config.titleColor as string) ?? "#0f172a"}
          onChange={(value) => update("titleColor", value)}
        />
        <ColorInput
          id="cfg-floor-body-color"
          label={t("configEditor.bodyColor")}
          value={(config.bodyColor as string) ?? "#475569"}
          onChange={(value) => update("bodyColor", value)}
        />
        <ColorInput
          id="cfg-floor-text-color"
          label="本文色"
          value={(config.textColor as string) ?? "#0f172a"}
          onChange={(value) => update("textColor", value)}
        />
        <ColorInput
          id="cfg-floor-badge-color"
          label="階数バッジ色"
          value={(config.floorBadgeColor as string) ?? "#0f172a"}
          onChange={(value) => update("floorBadgeColor", value)}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">フロア設定</h4>
          <p className="text-xs text-muted-foreground">
            表示する階数を 1 から 10 まで指定できます。指定した階数に応じて、1F からその階までの編集項目だけを表示します。
          </p>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="cfg-floor-count">表示階数</Label>
          <Input
            id="cfg-floor-count"
            type="number"
            min={1}
            max={10}
            value={floorCount}
            onChange={(e) => updateFloorCount(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {visibleFloors.map((floor, floorIndex) => {
            return (
              <details key={floor.floorNumber} className="rounded-md border p-3" open>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold">{floor.floorNumber}F</h5>
                      <p className="text-xs text-muted-foreground">
                        表示対象 / 店舗 {floor.shops.length}件
                      </p>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FacilitySwitch
                      id={`cfg-floor-m-${floorIndex}`}
                      label="男性トイレ"
                      checked={floor.hasMensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasMensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-w-${floorIndex}`}
                      label="女性トイレ"
                      checked={floor.hasWomensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasWomensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-exit-${floorIndex}`}
                      label="非常口"
                      checked={floor.hasEmergencyExit}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasEmergencyExit: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-esc-${floorIndex}`}
                      label="エスカレーター"
                      checked={floor.hasEscalator}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasEscalator: checked })}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h6 className="text-sm font-semibold">店舗情報</h6>
                        <p className="text-xs text-muted-foreground">ロゴとテキストを最大10件まで設定できます。</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addShop(floorIndex)}
                        disabled={floor.shops.length >= 10}
                      >
                        <Plus className="size-4" />
                        店舗を追加
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {floor.shops.map((shop, shopIndex) => (
                        <div key={shopIndex} className="grid gap-3 rounded-md border p-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                          <div className="space-y-1.5">
                            <Label htmlFor={`cfg-floor-logo-${floorIndex}-${shopIndex}`}>ロゴ</Label>
                            <Select
                              value={shop.logoPath || "__none__"}
                              onValueChange={(value) =>
                                updateShop(floorIndex, shopIndex, {
                                  logoPath: !value || value === "__none__" ? "" : value,
                                })
                              }
                            >
                              <SelectTrigger id={`cfg-floor-logo-${floorIndex}-${shopIndex}`}>
                                <SelectValue>
                                  {shop.logoPath
                                    ? mediaOptionLabel(shop.logoPath, imageMedia, t)
                                    : "ロゴなし"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">ロゴなし</SelectItem>
                                {imageMedia.map((media) => (
                                  <SelectItem key={media.id} value={media.filePath}>
                                    {mediaOptionLabel(media.filePath, imageMedia, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor={`cfg-floor-text-${floorIndex}-${shopIndex}`}>テキスト</Label>
                            <Input
                              id={`cfg-floor-text-${floorIndex}-${shopIndex}`}
                              value={shop.text}
                              maxLength={60}
                              onChange={(e) => updateShop(floorIndex, shopIndex, { text: e.target.value })}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeShop(floorIndex, shopIndex)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}

                      {floor.shops.length === 0 && (
                        <p className="text-sm text-muted-foreground">店舗情報はまだありません。</p>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">エレベーター設定</h4>
          <p className="text-xs text-muted-foreground">
            最大3基まで設定できます。接続階は必ず2階以上離れた範囲で指定してください。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {elevators.map((elevator, index) => (
            <div key={index} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold">{elevator.label || `EV ${String.fromCharCode(65 + index)}`}</h5>
                <Switch
                  checked={elevator.enabled}
                  onCheckedChange={(checked) => updateElevator(index, { enabled: checked })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`cfg-elevator-label-${index}`}>表示名</Label>
                <Input
                  id={`cfg-elevator-label-${index}`}
                  value={elevator.label}
                  maxLength={20}
                  onChange={(e) => updateElevator(index, { label: e.target.value })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-elevator-start-${index}`}>開始階</Label>
                  <Input
                    id={`cfg-elevator-start-${index}`}
                    type="number"
                    min={1}
                    max={floorCount}
                    value={elevator.startFloor}
                    onChange={(e) => updateElevator(index, { startFloor: clampFloor(e.target.value, elevator.startFloor) ?? elevator.startFloor })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-elevator-end-${index}`}>終了階</Label>
                  <Input
                    id={`cfg-elevator-end-${index}`}
                    type="number"
                    min={1}
                    max={floorCount}
                    value={elevator.endFloor}
                    onChange={(e) => updateElevator(index, { endFloor: clampFloor(e.target.value, elevator.endFloor) ?? elevator.endFloor })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mediaOptionLabel(
  filePath: string,
  items: Array<MediaItem & { filePath: string }>,
  t: ReturnType<typeof useLocale>["t"],
) {
  const index = items.findIndex((item) => item.filePath === filePath);
  if (index >= 0) {
    return t("schedule.imageNumber", { number: index + 1 });
  }

  return filePath.split("/").pop() ?? filePath;
}

function FacilitySwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-20 p-1"
      />
    </div>
  );
}