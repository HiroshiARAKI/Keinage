// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { SimpleBoardConfigEditor } from "./SimpleBoardConfigEditor";
import { PhotoClockConfigEditor } from "./PhotoClockConfigEditor";
import { RetroBoardConfigEditor } from "./RetroBoardConfigEditor";
import { MessageBoardConfigEditor } from "./MessageBoardConfigEditor";
import { CallNumberConfigEditor } from "./CallNumberConfigEditor";
import { ClinicHoursConfigEditor } from "./ClinicHoursConfigEditor";
import { RestaurantMenuConfigEditor } from "./RestaurantMenuConfigEditor";
import { QrInfoConfigEditor } from "./QrInfoConfigEditor";
import type { MediaItem, PublicBoardPlan } from "@/types";

export interface ConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
  boardPlan?: PublicBoardPlan;
}

const editors: Record<string, React.ComponentType<ConfigEditorProps>> = {
  simple: SimpleBoardConfigEditor,
  "photo-clock": PhotoClockConfigEditor,
  retro: RetroBoardConfigEditor,
  message: MessageBoardConfigEditor,
  "call-number": CallNumberConfigEditor,
  "clinic-hours": ClinicHoursConfigEditor,
  "restaurant-menu": RestaurantMenuConfigEditor,
  "qr-info": QrInfoConfigEditor,
};

export function TemplateConfigEditor({
  templateId,
  config,
  onChange,
  mediaItems,
  boardPlan,
}: {
  templateId: string;
} & ConfigEditorProps) {
  const { t } = useLocale();
  const Editor = editors[templateId];
  if (!Editor) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("configEditor.notAvailable")}
      </p>
    );
  }
  return (
    <Editor
      config={config}
      onChange={onChange}
      mediaItems={mediaItems}
      boardPlan={boardPlan}
    />
  );
}
