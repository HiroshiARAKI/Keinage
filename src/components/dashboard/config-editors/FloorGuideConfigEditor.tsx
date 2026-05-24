"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
import { createFloorGuideDefaultConfig } from "@/lib/template-default-configs";
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

function normalizeFloors(value: unknown, defaultFloors: FloorConfig[]): FloorConfig[] {
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

function normalizeElevators(value: unknown, floorCount: number, defaultElevators: ElevatorConfig[]): ElevatorConfig[] {
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
  const defaultConfig = createFloorGuideDefaultConfig(t);
  const updateConfig = onChange as Dispatch<SetStateAction<Record<string, unknown>>>;
  const floorCount = clampFloorCount(config.floorCount, inferFloorCount(config.floors));
  const floors = normalizeFloors(config.floors, defaultConfig.floors);
  const visibleFloors = floors.slice(0, floorCount);
  const elevators = normalizeElevators(config.elevators, floorCount, defaultConfig.elevators);
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
        elevators: normalizeElevators(currentConfig.elevators, nextFloorCount, defaultConfig.elevators),
      };
    });
  }

  function applyPreset(presetKey: (typeof FLOOR_GUIDE_THEME_PRESETS)[number]["key"]) {
    updateConfig((currentConfig) => applyFloorGuideThemePreset(currentConfig, presetKey));
  }

  function updateFloor(index: number, patch: Partial<FloorConfig>) {
    updateConfig((currentConfig) => {
      const currentFloors = normalizeFloors(currentConfig.floors, defaultConfig.floors);

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
      const currentFloors = normalizeFloors(currentConfig.floors, defaultConfig.floors);

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
      const currentFloors = normalizeFloors(currentConfig.floors, defaultConfig.floors);
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
      const currentFloors = normalizeFloors(currentConfig.floors, defaultConfig.floors);

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
      const currentElevators = normalizeElevators(currentConfig.elevators, currentFloorCount, defaultConfig.elevators);
      const nextElevators = currentElevators.map((elevator, elevatorIndex) =>
        elevatorIndex === index ? { ...elevator, ...patch } : elevator,
      );

      return {
        ...currentConfig,
        elevators: normalizeElevators(nextElevators, currentFloorCount, defaultConfig.elevators),
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
            value={(config.title as string) ?? defaultConfig.title}
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
          value={(config.body as string) ?? defaultConfig.body}
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
          label={t("configEditor.backgroundColor")}
          value={(config.backgroundColor as string) ?? "#f8fafc"}
          onChange={(value) => update("backgroundColor", value)}
        />
        <ColorInput
          id="cfg-floor-panel"
          label={t("configEditor.floorGuide.panelColor")}
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
          label={t("configEditor.textColor")}
          value={(config.textColor as string) ?? "#0f172a"}
          onChange={(value) => update("textColor", value)}
        />
        <ColorInput
          id="cfg-floor-badge-color"
          label={t("configEditor.floorGuide.floorBadgeColor")}
          value={(config.floorBadgeColor as string) ?? "#0f172a"}
          onChange={(value) => update("floorBadgeColor", value)}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">{t("configEditor.floorGuide.floors")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("configEditor.floorGuide.floorsHint")}
          </p>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="cfg-floor-count">{t("configEditor.floorGuide.floorCount")}</Label>
          <NumberInput
            id="cfg-floor-count"
            min={1}
            max={10}
            value={floorCount}
            onValueChange={updateFloorCount}
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
                        {t("configEditor.floorGuide.floorSummary", { count: floor.shops.length })}
                      </p>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FacilitySwitch
                      id={`cfg-floor-m-${floorIndex}`}
                      label={t("configEditor.floorGuide.mensRestroom")}
                      checked={floor.hasMensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasMensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-w-${floorIndex}`}
                      label={t("configEditor.floorGuide.womensRestroom")}
                      checked={floor.hasWomensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasWomensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-exit-${floorIndex}`}
                      label={t("configEditor.floorGuide.emergencyExit")}
                      checked={floor.hasEmergencyExit}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasEmergencyExit: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-esc-${floorIndex}`}
                      label={t("configEditor.floorGuide.escalator")}
                      checked={floor.hasEscalator}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasEscalator: checked })}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h6 className="text-sm font-semibold">{t("configEditor.floorGuide.shops")}</h6>
                        <p className="text-xs text-muted-foreground">{t("configEditor.floorGuide.shopsHint")}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addShop(floorIndex)}
                        disabled={floor.shops.length >= 10}
                      >
                        <Plus className="size-4" />
                        {t("configEditor.floorGuide.addShop")}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {floor.shops.map((shop, shopIndex) => (
                        <div key={shopIndex} className="grid gap-3 rounded-md border p-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                          <div className="space-y-1.5">
                            <Label htmlFor={`cfg-floor-logo-${floorIndex}-${shopIndex}`}>{t("configEditor.floorGuide.logo")}</Label>
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
                                    : t("configEditor.floorGuide.noLogo")}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t("configEditor.floorGuide.noLogo")}</SelectItem>
                                {imageMedia.map((media) => (
                                  <SelectItem key={media.id} value={media.filePath}>
                                    {mediaOptionLabel(media.filePath, imageMedia, t)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor={`cfg-floor-text-${floorIndex}-${shopIndex}`}>{t("configEditor.floorGuide.shopText")}</Label>
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
                        <p className="text-sm text-muted-foreground">{t("configEditor.floorGuide.noShops")}</p>
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
          <h4 className="text-sm font-semibold">{t("configEditor.floorGuide.elevators")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("configEditor.floorGuide.elevatorsHint")}
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
                <Label htmlFor={`cfg-elevator-label-${index}`}>{t("configEditor.floorGuide.displayName")}</Label>
                <Input
                  id={`cfg-elevator-label-${index}`}
                  value={elevator.label}
                  maxLength={20}
                  onChange={(e) => updateElevator(index, { label: e.target.value })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-elevator-start-${index}`}>{t("configEditor.floorGuide.startFloor")}</Label>
                  <NumberInput
                    id={`cfg-elevator-start-${index}`}
                    min={1}
                    max={floorCount}
                    value={elevator.startFloor}
                    onValueChange={(value) => updateElevator(index, { startFloor: value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-elevator-end-${index}`}>{t("configEditor.floorGuide.endFloor")}</Label>
                  <NumberInput
                    id={`cfg-elevator-end-${index}`}
                    min={1}
                    max={floorCount}
                    value={elevator.endFloor}
                    onValueChange={(value) => updateElevator(index, { endFloor: value })}
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
