"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
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

type SplitPaneType = "text" | "image" | "video";
type SplitDirection = "horizontal" | "vertical";

interface SplitPaneConfig {
  type: SplitPaneType;
  title: string;
  body: string;
  mediaPath: string;
  backgroundColor: string;
  textColor: string;
}

interface SplitViewConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
}

const defaultPanes: SplitPaneConfig[] = [
  {
    type: "text",
    title: "お知らせ",
    body: "画像・動画・テキストを2分割で自由に表示できます。",
    mediaPath: "",
    backgroundColor: "#0f172a",
    textColor: "#f8fafc",
  },
  {
    type: "image",
    title: "",
    body: "",
    mediaPath: "",
    backgroundColor: "#e2e8f0",
    textColor: "#0f172a",
  },
];

function normalizePaneType(value: unknown): SplitPaneType {
  if (value === "image" || value === "video") return value;
  return "text";
}

function normalizePanes(value: unknown): SplitPaneConfig[] {
  const rawPanes = Array.isArray(value) ? value : defaultPanes;
  const panes = rawPanes.slice(0, 2).map((pane, index) => {
    const raw = pane && typeof pane === "object"
      ? (pane as Partial<SplitPaneConfig>)
      : {};
    const fallback = defaultPanes[index] ?? defaultPanes[0];
    return {
      type: normalizePaneType(raw.type ?? fallback.type),
      title: typeof raw.title === "string" ? raw.title : fallback.title,
      body: typeof raw.body === "string" ? raw.body : fallback.body,
      mediaPath: typeof raw.mediaPath === "string" ? raw.mediaPath : "",
      backgroundColor:
        typeof raw.backgroundColor === "string" && raw.backgroundColor
          ? raw.backgroundColor
          : fallback.backgroundColor,
      textColor:
        typeof raw.textColor === "string" && raw.textColor
          ? raw.textColor
          : fallback.textColor,
    };
  });

  while (panes.length < 2) {
    panes.push(defaultPanes[panes.length]);
  }

  return panes;
}

export function SplitViewConfigEditor({
  config,
  onChange,
  mediaItems = [],
}: SplitViewConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const panes = normalizePanes(config.panes);
  const fontFamily = (config.fontFamily as string) ?? "";
  const showClock = (config.showClock as boolean) ?? false;
  const splitDirection =
    ((config.splitDirection as string) ?? "horizontal") === "vertical"
      ? "vertical"
      : "horizontal";
  const imageMedia = mediaItems.filter(
    (item): item is MediaItem & { filePath: string } =>
      item.type === "image" && typeof item.filePath === "string" && item.filePath.length > 0,
  );
  const videoMedia = mediaItems.filter(
    (item): item is MediaItem & { filePath: string } =>
      item.type === "video" && typeof item.filePath === "string" && item.filePath.length > 0,
  );

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updatePane(index: number, patch: Partial<SplitPaneConfig>) {
    update(
      "panes",
      panes.map((pane, paneIndex) =>
        paneIndex === index ? { ...pane, ...patch } : pane,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-split-direction">分割方向</Label>
          <Select
            value={splitDirection}
            onValueChange={(value) => update("splitDirection", value as SplitDirection)}
          >
            <SelectTrigger id="cfg-split-direction">
              <SelectValue>
                {splitDirection === "vertical" ? "上下" : "左右"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">左右</SelectItem>
              <SelectItem value="vertical">上下</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FontSelect
          id="cfg-split-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
        <ColorInput
          id="cfg-split-divider"
          label="境界線色"
          value={(config.dividerColor as string) ?? "#e2e8f0"}
          onChange={(value) => update("dividerColor", value)}
        />
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <Switch
          id="cfg-split-showClock"
          checked={showClock}
          onCheckedChange={(value) => update("showClock", value)}
        />
        <Label htmlFor="cfg-split-showClock">{t("configEditor.showClock")}</Label>
      </div>

      <div className="space-y-4">
        {panes.map((pane, index) => {
          const mediaChoices = pane.type === "video" ? videoMedia : imageMedia;
          const mediaLabel = pane.mediaPath
            ? mediaOptionLabel(pane.mediaPath, mediaChoices)
            : pane.type === "video"
              ? "動画なし"
              : "画像なし";

          return (
            <div key={index} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">ペイン {index + 1}</h4>
                <span className="text-xs text-muted-foreground">
                  {index === 0 ? "左または上" : "右または下"}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-split-type-${index}`}>表示タイプ</Label>
                  <Select
                    value={pane.type}
                    onValueChange={(value) =>
                      updatePane(index, {
                        type: normalizePaneType(value),
                        mediaPath: "",
                      })
                    }
                  >
                    <SelectTrigger id={`cfg-split-type-${index}`}>
                      <SelectValue>{paneTypeLabel(pane.type)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">テキスト</SelectItem>
                      <SelectItem value="image">画像</SelectItem>
                      <SelectItem value="video">動画</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <ColorInput
                  id={`cfg-split-bg-${index}`}
                  label="背景色"
                  value={pane.backgroundColor}
                  onChange={(value) => updatePane(index, { backgroundColor: value })}
                />

                <ColorInput
                  id={`cfg-split-text-${index}`}
                  label="文字色"
                  value={pane.textColor}
                  onChange={(value) => updatePane(index, { textColor: value })}
                />
              </div>

              {pane.type === "text" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`cfg-split-title-${index}`}>見出し</Label>
                    <Input
                      id={`cfg-split-title-${index}`}
                      value={pane.title}
                      maxLength={80}
                      onChange={(e) => updatePane(index, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`cfg-split-body-${index}`}>本文</Label>
                    <Textarea
                      id={`cfg-split-body-${index}`}
                      rows={4}
                      maxLength={400}
                      value={pane.body}
                      onChange={(e) => updatePane(index, { body: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor={`cfg-split-media-${index}`}>
                    {pane.type === "video" ? "動画" : "画像"}
                  </Label>
                  <Select
                    value={pane.mediaPath || "__none__"}
                    onValueChange={(value) =>
                      updatePane(index, {
                        mediaPath: !value || value === "__none__" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger id={`cfg-split-media-${index}`}>
                      <SelectValue>{mediaLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {pane.type === "video" ? "動画なし" : "画像なし"}
                      </SelectItem>
                      {mediaChoices.map((media) => (
                        <SelectItem key={media.id} value={media.filePath}>
                          {mediaOptionLabel(media.filePath, mediaChoices)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {pane.type === "video"
                      ? "動画はこのペイン内でループ再生されます。"
                      : "画像は cover 表示で余白なく表示されます。"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function paneTypeLabel(type: SplitPaneType) {
  if (type === "image") return "画像";
  if (type === "video") return "動画";
  return "テキスト";
}

function mediaOptionLabel(filePath: string, items: MediaItem[]) {
  const media = items.find((item) => item.filePath === filePath);
  return media?.filePath.split("/").pop() ?? filePath.split("/").pop() ?? filePath;
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