// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps } from "@/types";

interface MenuItemConfig {
  name: string;
  price: string;
  imageUrl: string;
}

interface MenuColumnConfig {
  title: string;
  items: MenuItemConfig[];
}

interface RestaurantMenuConfig {
  title: string;
  body: string;
  titleFontSize: number;
  bodyFontSize: number;
  titleColor: string;
  bodyColor: string;
  fontFamily: string;
  imageShape: "wide" | "square";
  columnCount: number;
  columns: MenuColumnConfig[];
}

export const restaurantMenuDefaultConfig: RestaurantMenuConfig = {
  title: "本日のメニュー",
  body: "おすすめ商品を表示しています。",
  titleFontSize: 54,
  bodyFontSize: 24,
  titleColor: "#f8fafc",
  bodyColor: "#f8fafc",
  fontFamily: "",
  imageShape: "wide",
  columnCount: 3,
  columns: [
    {
      title: "Main",
      items: [
        { name: "Special Plate", price: "¥1,200", imageUrl: "" },
        { name: "Pasta", price: "¥980", imageUrl: "" },
      ],
    },
    {
      title: "Drink",
      items: [
        { name: "Coffee", price: "¥450", imageUrl: "" },
        { name: "Tea", price: "¥450", imageUrl: "" },
      ],
    },
  ],
};

function parseConfig(raw: unknown): RestaurantMenuConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<RestaurantMenuConfig>;
  const columnCount = Math.min(3, Math.max(1, Number(cfg.columnCount) || restaurantMenuDefaultConfig.columnCount));
  const rawColumns = Array.isArray(cfg.columns) ? cfg.columns : restaurantMenuDefaultConfig.columns;
  const columns = rawColumns.slice(0, columnCount).map((column) => ({
    title: typeof column.title === "string" ? column.title : "",
    items: Array.isArray(column.items)
      ? column.items.slice(0, 5).map((item) => ({
        name: typeof item.name === "string" ? item.name : "",
        price: typeof item.price === "string" ? item.price : "",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
      }))
      : [],
  }));
  while (columns.length < columnCount) {
    columns.push({ title: `Menu ${columns.length + 1}`, items: [] });
  }

  return {
    ...restaurantMenuDefaultConfig,
    ...cfg,
    columnCount,
    columns,
  };
}

export default function RestaurantMenuBoard({ board, boardPlan }: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const canShowImages = boardPlan?.menuItemImages !== false;

  return (
    <div
      className="flex h-screen w-screen flex-col bg-[#111111] p-10 text-white"
      style={{ fontFamily: config.fontFamily || undefined }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}
      <header className="mb-8">
        <h1
          className="font-black tracking-normal"
          style={{ color: config.titleColor, fontSize: config.titleFontSize }}
        >
          {config.title || board.name}
        </h1>
        {config.body && (
          <p
            className="mt-2"
            style={{ color: config.bodyColor, fontSize: config.bodyFontSize }}
          >
            {config.body}
          </p>
        )}
      </header>

      <div className="grid flex-1 min-h-0 gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, config.columns.length)}, minmax(0, 1fr))` }}>
        {config.columns.map((column, columnIndex) => (
          <section key={columnIndex} className="min-w-0 rounded-lg border border-white/15 bg-white/8 p-5">
            <h2 className="mb-4 border-b border-white/20 pb-2 text-2xl font-bold text-amber-300">
              {column.title || `Menu ${columnIndex + 1}`}
            </h2>
            <div className="space-y-4">
              {column.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex min-h-20 items-center gap-3 rounded-md bg-black/20 p-3">
                  {canShowImages && item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className={`shrink-0 rounded object-cover ${
                        config.imageShape === "square" ? "size-16" : "h-16 w-24"
                      }`}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-2xl font-semibold">{item.name || "—"}</span>
                    <span className="shrink-0 text-2xl font-bold text-amber-200">{item.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
