"use client";

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
import type { MediaItem } from "@/types";
import { FontSelect, useLoadAllGoogleFonts } from "./shared";

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

interface FloorGuideConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
}

function createDefaultFloors(): FloorConfig[] {
  return Array.from({ length: 10 }, (_, index) => ({
    floorNumber: index + 1,
    enabled: index < 4,
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
      floorNumber: fallback.floorNumber,
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
  const rawElevators = Array.isArray(value) ? value : defaultElevators;

  return defaultElevators.map((fallback, index) => {
    const raw = rawElevators[index] && typeof rawElevators[index] === "object"
      ? (rawElevators[index] as Partial<ElevatorConfig>)
      : {};

    const first = clampFloor(raw.startFloor, fallback.startFloor);
    const second = clampFloor(raw.endFloor, fallback.endFloor);
    const startFloor = Math.min(first, second);
    const endFloor = Math.max(first, second === first ? Math.min(10, first + 1) : second);

    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      label: typeof raw.label === "string" && raw.label ? raw.label : fallback.label,
      startFloor,
      endFloor,
    };
  });
}

function clampFloor(value: unknown, fallback: number) {
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
  const floors = normalizeFloors(config.floors);
  const elevators = normalizeElevators(config.elevators);
  const fontFamily = (config.fontFamily as string) ?? "";
  const imageMedia = mediaItems.filter(
    (item): item is MediaItem & { filePath: string } =>
      item.type === "image" && typeof item.filePath === "string" && item.filePath.length > 0,
  );

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateFloor(index: number, patch: Partial<FloorConfig>) {
    update(
      "floors",
      floors.map((floor, floorIndex) =>
        floorIndex === index ? { ...floor, ...patch } : floor,
      ),
    );
  }

  function updateShop(floorIndex: number, shopIndex: number, patch: Partial<FloorShopConfig>) {
    updateFloor(floorIndex, {
      shops: floors[floorIndex].shops.map((shop, index) =>
        index === shopIndex ? { ...shop, ...patch } : shop,
      ),
    });
  }

  function addShop(floorIndex: number) {
    if (floors[floorIndex].shops.length >= 10) return;
    updateFloor(floorIndex, {
      shops: [...floors[floorIndex].shops, { logoPath: "", text: "" }],
    });
  }

  function removeShop(floorIndex: number, shopIndex: number) {
    updateFloor(floorIndex, {
      shops: floors[floorIndex].shops.filter((_, index) => index !== shopIndex),
    });
  }

  function updateElevator(index: number, patch: Partial<ElevatorConfig>) {
    update(
      "elevators",
      elevators.map((elevator, elevatorIndex) =>
        elevatorIndex === index ? { ...elevator, ...patch } : elevator,
      ),
    );
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
            1F から 10F まで設定できます。店舗情報は各階ごとに最大10件です。
          </p>
        </div>

        <div className="space-y-3">
          {[...floors].sort((left, right) => right.floorNumber - left.floorNumber).map((floor) => {
            const floorIndex = floors.findIndex((item) => item.floorNumber === floor.floorNumber);
            return (
              <details key={floor.floorNumber} className="rounded-md border p-3" open={floor.enabled}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold">{floor.floorNumber}F</h5>
                      <p className="text-xs text-muted-foreground">
                        {floor.enabled ? "表示中" : "非表示"} / 店舗 {floor.shops.length}件
                      </p>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Switch
                      id={`cfg-floor-enabled-${floor.floorNumber}`}
                      checked={floor.enabled}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { enabled: checked })}
                    />
                    <Label htmlFor={`cfg-floor-enabled-${floor.floorNumber}`}>この階を表示する</Label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FacilitySwitch
                      id={`cfg-floor-m-${floor.floorNumber}`}
                      label="男性トイレ"
                      checked={floor.hasMensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasMensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-w-${floor.floorNumber}`}
                      label="女性トイレ"
                      checked={floor.hasWomensRestroom}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasWomensRestroom: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-exit-${floor.floorNumber}`}
                      label="非常口"
                      checked={floor.hasEmergencyExit}
                      onCheckedChange={(checked) => updateFloor(floorIndex, { hasEmergencyExit: checked })}
                    />
                    <FacilitySwitch
                      id={`cfg-floor-esc-${floor.floorNumber}`}
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
                            <Label htmlFor={`cfg-floor-logo-${floor.floorNumber}-${shopIndex}`}>ロゴ</Label>
                            <Select
                              value={shop.logoPath || "__none__"}
                              onValueChange={(value) =>
                                updateShop(floorIndex, shopIndex, {
                                  logoPath: !value || value === "__none__" ? "" : value,
                                })
                              }
                            >
                              <SelectTrigger id={`cfg-floor-logo-${floor.floorNumber}-${shopIndex}`}>
                                <SelectValue>
                                  {shop.logoPath
                                    ? mediaOptionLabel(shop.logoPath, imageMedia)
                                    : "ロゴなし"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">ロゴなし</SelectItem>
                                {imageMedia.map((media) => (
                                  <SelectItem key={media.id} value={media.filePath}>
                                    {mediaOptionLabel(media.filePath, imageMedia)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor={`cfg-floor-text-${floor.floorNumber}-${shopIndex}`}>テキスト</Label>
                            <Input
                              id={`cfg-floor-text-${floor.floorNumber}-${shopIndex}`}
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
                  <Select
                    value={String(elevator.startFloor)}
                    onValueChange={(value) => updateElevator(index, { startFloor: clampFloor(value, elevator.startFloor) })}
                  >
                    <SelectTrigger id={`cfg-elevator-start-${index}`}>
                      <SelectValue>{elevator.startFloor}F</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {floorOptions().map((floor) => (
                        <SelectItem key={floor} value={String(floor)}>{floor}F</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-elevator-end-${index}`}>終了階</Label>
                  <Select
                    value={String(elevator.endFloor)}
                    onValueChange={(value) => updateElevator(index, { endFloor: clampFloor(value, elevator.endFloor) })}
                  >
                    <SelectTrigger id={`cfg-elevator-end-${index}`}>
                      <SelectValue>{elevator.endFloor}F</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {floorOptions().map((floor) => (
                        <SelectItem key={floor} value={String(floor)}>{floor}F</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function floorOptions() {
  return Array.from({ length: 10 }, (_, index) => index + 1);
}

function mediaOptionLabel(filePath: string, items: Array<MediaItem & { filePath: string }>) {
  const media = items.find((item) => item.filePath === filePath);
  return media?.filePath.split("/").pop() ?? filePath.split("/").pop() ?? filePath;
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