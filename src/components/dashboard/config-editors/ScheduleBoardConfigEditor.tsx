"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FontSelect, useLoadAllGoogleFonts } from "./shared";

interface ScheduleEntryConfig {
  content: string;
  startTime: string;
  endTime: string;
  color: string;
}


interface ScheduleBoardConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const defaultEntries: ScheduleEntryConfig[] = [
  {
    content: "朝礼",
    startTime: "09:00",
    endTime: "09:30",
    color: "#dbeafe",
  },
];

function normalizeEntries(value: unknown) {
  if (!Array.isArray(value)) return defaultEntries;
  const entries = value.slice(0, 20).map((entry) => {
    const raw = entry && typeof entry === "object"
      ? (entry as Partial<ScheduleEntryConfig>)
      : {};
    return {
      content: typeof raw.content === "string" ? raw.content : "",
      startTime: typeof raw.startTime === "string" ? raw.startTime : "09:00",
      endTime: typeof raw.endTime === "string" ? raw.endTime : "10:00",
      color: typeof raw.color === "string" && raw.color ? raw.color : "#dbeafe",
    };
  });

  return entries.length > 0 ? entries : defaultEntries;
}

export function ScheduleBoardConfigEditor({
  config,
  onChange,
}: ScheduleBoardConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const entries = normalizeEntries(config.entries);
  const fontFamily = (config.fontFamily as string) ?? "";
  const showClock = (config.showClock as boolean) ?? false;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateEntry(index: number, patch: Partial<ScheduleEntryConfig>) {
    update(
      "entries",
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function addEntry() {
    if (entries.length >= 20) return;
    update("entries", [
      ...entries,
      {
        content: "",
        startTime: "09:00",
        endTime: "10:00",
        color: "#e2e8f0",
      },
    ]);
  }

  function removeEntry(index: number) {
    update(
      "entries",
      entries.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-schedule-title">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-schedule-title"
            value={(config.title as string) ?? "本日のスケジュール"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <FontSelect
          id="cfg-schedule-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-schedule-body">{t("configEditor.bodyText")}</Label>
        <Textarea
          id="cfg-schedule-body"
          rows={3}
          value={(config.body as string) ?? "時間に沿って本日の予定を表示します。"}
          onChange={(e) => update("body", e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-schedule-start">表示開始時刻</Label>
          <Input
            id="cfg-schedule-start"
            type="time"
            value={(config.displayStartTime as string) ?? "08:00"}
            onChange={(e) => update("displayStartTime", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-schedule-end">表示終了時刻</Label>
          <Input
            id="cfg-schedule-end"
            type="time"
            value={(config.displayEndTime as string) ?? "18:00"}
            onChange={(e) => update("displayEndTime", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">最小 1 時間分を表示します。</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <Switch
          id="cfg-schedule-showClock"
          checked={showClock}
          onCheckedChange={(value) => update("showClock", value)}
        />
        <Label htmlFor="cfg-schedule-showClock">{t("configEditor.showClock")}</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorInput
          id="cfg-schedule-background"
          label="背景色"
          value={(config.backgroundColor as string) ?? "#f8fafc"}
          onChange={(value) => update("backgroundColor", value)}
        />
        <ColorInput
          id="cfg-schedule-titleColor"
          label={t("configEditor.titleColor")}
          value={(config.titleColor as string) ?? "#0f172a"}
          onChange={(value) => update("titleColor", value)}
        />
        <ColorInput
          id="cfg-schedule-bodyColor"
          label={t("configEditor.bodyColor")}
          value={(config.bodyColor as string) ?? "#475569"}
          onChange={(value) => update("bodyColor", value)}
        />
        <ColorInput
          id="cfg-schedule-timeColor"
          label="時刻ラベル色"
          value={(config.timeLabelColor as string) ?? "#334155"}
          onChange={(value) => update("timeLabelColor", value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">予定カード</h4>
            <p className="text-xs text-muted-foreground">1分単位で最大20件まで登録できます。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addEntry} disabled={entries.length >= 20}>
            <Plus className="size-4" />
            予定を追加
          </Button>
        </div>

        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={index} className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_132px_132px_90px_auto] md:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-schedule-entry-content-${index}`}>内容</Label>
                  <Input
                    id={`cfg-schedule-entry-content-${index}`}
                    value={entry.content}
                    maxLength={120}
                    placeholder="予定内容を入力"
                    onChange={(e) => updateEntry(index, { content: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-schedule-entry-start-${index}`}>開始</Label>
                  <Input
                    id={`cfg-schedule-entry-start-${index}`}
                    type="time"
                    value={entry.startTime}
                    onChange={(e) => updateEntry(index, { startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-schedule-entry-end-${index}`}>終了</Label>
                  <Input
                    id={`cfg-schedule-entry-end-${index}`}
                    type="time"
                    value={entry.endTime}
                    onChange={(e) => updateEntry(index, { endTime: e.target.value })}
                  />
                </div>
                <ColorInput
                  id={`cfg-schedule-entry-color-${index}`}
                  label="色"
                  value={entry.color}
                  onChange={(value) => updateEntry(index, { color: value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeEntry(index)}
                  disabled={entries.length <= 1}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
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