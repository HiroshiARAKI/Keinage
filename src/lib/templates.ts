// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { TemplateId, BoardTemplate } from "@/types";
import SimpleBoard, {
  simpleBoardDefaultConfig,
} from "@/components/board/templates/SimpleBoard";
import PhotoClockBoard, {
  photoClockDefaultConfig,
} from "@/components/board/templates/PhotoClockBoard";
import RetroBoard, {
  retroBoardDefaultConfig,
} from "@/components/board/templates/RetroBoard";
import MessageBoard, {
  messageBoardDefaultConfig,
} from "@/components/board/templates/MessageBoard";
import CallNumberBoard, {
  callNumberDefaultConfig,
} from "@/components/board/templates/CallNumberBoard";
import ClinicHoursBoard, {
  clinicHoursDefaultConfig,
} from "@/components/board/templates/ClinicHoursBoard";
import RestaurantMenuBoard, {
  restaurantMenuDefaultConfig,
} from "@/components/board/templates/RestaurantMenuBoard";
import QrInfoBoard, {
  qrInfoDefaultConfig,
} from "@/components/board/templates/QrInfoBoard";

/** Registry of all available board templates */
export const templates: Record<TemplateId, BoardTemplate> = {
  simple: {
    id: "simple",
    name: "シンプル掲示板",
    description:
      "画像/動画のスライドショーとテキストティッカーのシンプルな電子掲示板",
    defaultConfig: simpleBoardDefaultConfig,
    component: SimpleBoard,
  },
  "photo-clock": {
    id: "photo-clock",
    name: "フォトクロック",
    description: "写真スライドショーに日時オーバーレイを重ねた表示",
    defaultConfig: photoClockDefaultConfig,
    component: PhotoClockBoard,
  },
  retro: {
    id: "retro",
    name: "レトロ掲示板",
    description:
      "駅の案内板風ドットマトリクスデザインのクラシックな掲示板",
    defaultConfig: retroBoardDefaultConfig,
    component: RetroBoard,
  },
  message: {
    id: "message",
    name: "メッセージ掲示板",
    description:
      "外部APIからのメッセージをリアルタイム表示する掲示板",
    defaultConfig: messageBoardDefaultConfig,
    component: MessageBoard,
  },
  "call-number": {
    id: "call-number",
    name: "呼び出し番号",
    description:
      "病院や飲食店の呼び出し番号を表示するテンプレート",
    defaultConfig: callNumberDefaultConfig,
    component: CallNumberBoard,
  },
  "clinic-hours": {
    id: "clinic-hours",
    name: "診療時間案内",
    description:
      "診療日と休診日をカレンダー形式で案内するテンプレート",
    defaultConfig: clinicHoursDefaultConfig as unknown as Record<string, unknown>,
    component: ClinicHoursBoard,
  },
  "restaurant-menu": {
    id: "restaurant-menu",
    name: "飲食店メニュー",
    description:
      "商品名・価格・写真を列レイアウトで表示するメニューテンプレート",
    defaultConfig: restaurantMenuDefaultConfig as unknown as Record<string, unknown>,
    component: RestaurantMenuBoard,
  },
  "qr-info": {
    id: "qr-info",
    name: "QRコード付き案内",
    description:
      "QRコードと説明文を大きく表示する案内テンプレート",
    defaultConfig: qrInfoDefaultConfig as unknown as Record<string, unknown>,
    component: QrInfoBoard,
  },
};

export function getTemplate(templateId: string): BoardTemplate | undefined {
  return templates[templateId as TemplateId];
}
