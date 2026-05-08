// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaItem, PublicBoardPlan } from "@/types";
import { FontSelect, numberValue, useLoadAllGoogleFonts } from "./shared";

interface MenuItemConfig {
  name: string;
  price: string;
  imageUrl: string;
}

interface MenuColumnConfig {
  title: string;
  items: MenuItemConfig[];
}

const emptyItem: MenuItemConfig = { name: "", price: "", imageUrl: "" };

interface RestaurantMenuConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
  boardPlan?: PublicBoardPlan;
}

export function RestaurantMenuConfigEditor({
  config,
  onChange,
  mediaItems = [],
  boardPlan,
}: RestaurantMenuConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const columns = normalizeColumns(config.columns);
  const columnCount = Math.min(3, Math.max(1, numberValue(config.columnCount, columns.length || 3)));
  const fontFamily = (config.fontFamily as string) ?? "";
  const canUseImages = boardPlan?.menuItemImages !== false;
  const imageMedia = mediaItems.filter((item) => item.type === "image");
  const imageShape = ((config.imageShape as string) ?? "wide") === "square" ? "square" : "wide";

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateColumn(index: number, patch: Partial<MenuColumnConfig>) {
    update(
      "columns",
      columns.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column,
      ),
    );
  }

  function updateItem(columnIndex: number, itemIndex: number, patch: Partial<MenuItemConfig>) {
    updateColumn(columnIndex, {
      items: columns[columnIndex].items.map((item, index) =>
        index === itemIndex ? { ...item, ...patch } : item,
      ),
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-menu-title">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-menu-title"
            value={(config.title as string) ?? "TODAY'S MENU"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-menu-body">{t("configEditor.bodyText")}</Label>
          <Input
            id="cfg-menu-body"
            value={(config.body as string) ?? "おすすめ商品を表示しています。"}
            onChange={(e) => update("body", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-menu-columnCount">{t("configEditor.menuColumns")}</Label>
          <Select
            value={String(columnCount)}
            onValueChange={(value) => {
              if (!value) return;
              update("columnCount", parseInt(value, 10));
            }}
          >
            <SelectTrigger id="cfg-menu-columnCount">
              <SelectValue>{String(columnCount)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FontSelect
          id="cfg-menu-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="cfg-menu-imageShape">{t("configEditor.imageShape")}</Label>
          <Select
            value={imageShape}
            onValueChange={(value) => {
              if (!value) return;
              update("imageShape", value);
            }}
          >
            <SelectTrigger id="cfg-menu-imageShape">
              <SelectValue>
                {imageShape === "square"
                  ? t("configEditor.imageShapeSquare")
                  : t("configEditor.imageShapeWide")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wide">{t("configEditor.imageShapeWide")}</SelectItem>
              <SelectItem value="square">{t("configEditor.imageShapeSquare")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FontNumber id="cfg-menu-titleFontSize" label={t("configEditor.titleFontSize")} value={numberValue(config.titleFontSize, 58)} onChange={(value) => update("titleFontSize", value)} />
        <FontNumber id="cfg-menu-bodyFontSize" label={t("configEditor.bodyFontSize")} value={numberValue(config.bodyFontSize, 28)} onChange={(value) => update("bodyFontSize", value)} />
        <ColorInput id="cfg-menu-titleColor" label={t("configEditor.titleColor")} value={(config.titleColor as string) ?? "#f8fafc"} onChange={(value) => update("titleColor", value)} />
        <ColorInput id="cfg-menu-bodyColor" label={t("configEditor.bodyColor")} value={(config.bodyColor as string) ?? "#f8fafc"} onChange={(value) => update("bodyColor", value)} />
      </div>

      {!canUseImages && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("configEditor.menuImagesPlanHint")}
        </div>
      )}

      <div className="space-y-4">
        {columns.slice(0, columnCount).map((column, columnIndex) => (
          <div key={columnIndex} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{columnIndex + 1}</Badge>
              <Input
                value={column.title}
                placeholder={t("configEditor.columnTitle")}
                onChange={(e) => updateColumn(columnIndex, { title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              {column.items.map((item, itemIndex) => {
                const selectedImageLabel = item.imageUrl
                  ? imageOptionLabel(item.imageUrl, imageMedia, t)
                  : t("configEditor.itemImageNone");

                return (
                  <div key={itemIndex} className="grid gap-2 md:grid-cols-[1fr_120px_180px]">
                  <Input
                    value={item.name}
                    placeholder={t("configEditor.itemName")}
                    onChange={(e) => updateItem(columnIndex, itemIndex, { name: e.target.value })}
                  />
                  <Input
                    value={item.price}
                    placeholder={t("configEditor.itemPrice")}
                    onChange={(e) => updateItem(columnIndex, itemIndex, { price: e.target.value })}
                  />
                  <Select
                    value={item.imageUrl || "__none__"}
                    disabled={!canUseImages}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateItem(columnIndex, itemIndex, {
                        imageUrl: value === "__none__" ? "" : value,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("configEditor.itemImage")}>
                        {selectedImageLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("configEditor.itemImageNone")}</SelectItem>
                      {imageMedia.map((media, index) => (
                        <SelectItem key={media.id} value={media.filePath}>
                          {t("schedule.imageOption", { number: index + 1, name: media.filePath.split("/").pop() ?? media.id })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function imageOptionLabel(
  filePath: string,
  imageMedia: MediaItem[],
  t: ReturnType<typeof useLocale>["t"],
) {
  const index = imageMedia.findIndex((media) => media.filePath === filePath);
  if (index < 0) return filePath.split("/").pop() ?? filePath;
  const media = imageMedia[index];
  return t("schedule.imageOption", {
    number: index + 1,
    name: media.filePath.split("/").pop() ?? media.id,
  });
}

function normalizeColumns(value: unknown): MenuColumnConfig[] {
  const rawColumns = Array.isArray(value) ? value : [];
  const columns = rawColumns.slice(0, 3).map((raw, index) => {
    const column = raw && typeof raw === "object" ? (raw as Partial<MenuColumnConfig>) : {};
    return {
      title: column.title ?? `Menu ${index + 1}`,
      items: normalizeItems(column.items),
    };
  });

  while (columns.length < 3) {
    columns.push({
      title: `Menu ${columns.length + 1}`,
      items: normalizeItems([]),
    });
  }

  return columns;
}

function normalizeItems(value: unknown): MenuItemConfig[] {
  const rawItems = Array.isArray(value) ? value : [];
  const items = rawItems.slice(0, 5).map((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Partial<MenuItemConfig>) : {};
    return {
      name: item.name ?? "",
      price: item.price ?? "",
      imageUrl: item.imageUrl ?? "",
    };
  });

  while (items.length < 5) {
    items.push({ ...emptyItem });
  }

  return items;
}

function FontNumber({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={12}
        max={120}
        value={value}
        onChange={(e) => onChange(Math.max(12, parseInt(e.target.value, 10) || value))}
      />
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
