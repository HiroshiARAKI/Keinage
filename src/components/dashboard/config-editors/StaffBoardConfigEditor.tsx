"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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

interface StaffProfileConfig {
  imageUrl: string;
  name: string;
  role: string;
  description: string;
  accentColor: string;
}

type StaffImageObjectFit = "contain" | "cover";

interface StaffBoardConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  mediaItems?: MediaItem[];
}

const defaultAccentColors = [
  "#dbeafe",
  "#dcfce7",
  "#fef3c7",
  "#fae8ff",
  "#fee2e2",
  "#e0f2fe",
  "#ede9fe",
  "#fde68a",
];

const defaultProfiles: StaffProfileConfig[] = [
  {
    imageUrl: "",
    name: "山田 花子",
    role: "店長",
    description: "接客全般を担当しています。お気軽にお声がけください。",
    accentColor: defaultAccentColors[0],
  },
];

function normalizeProfiles(value: unknown) {
  if (!Array.isArray(value)) return defaultProfiles;
  const profiles = value.slice(0, 8).map((profile, index) => {
    const raw = profile && typeof profile === "object"
      ? (profile as Partial<StaffProfileConfig>)
      : {};
    return {
      imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
      name: typeof raw.name === "string" ? raw.name : "",
      role: typeof raw.role === "string" ? raw.role : "",
      description: typeof raw.description === "string" ? raw.description : "",
      accentColor:
        typeof raw.accentColor === "string" && raw.accentColor
          ? raw.accentColor
          : defaultAccentColors[index % defaultAccentColors.length],
    };
  });

  return profiles.length > 0 ? profiles : defaultProfiles;
}

export function StaffBoardConfigEditor({
  config,
  onChange,
  mediaItems = [],
}: StaffBoardConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const profiles = normalizeProfiles(config.profiles);
  const [collapsedProfiles, setCollapsedProfiles] = useState<number[]>([]);
  const fontFamily = (config.fontFamily as string) ?? "";
  const showClock = (config.showClock as boolean) ?? false;
  const objectFit = (config.objectFit as StaffImageObjectFit) === "contain"
    ? "contain"
    : "cover";
  const imageMedia = mediaItems.filter((item) => item.type === "image");

  useEffect(() => {
    setCollapsedProfiles((current) => current.filter((index) => index < profiles.length));
  }, [profiles.length]);

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateProfile(index: number, patch: Partial<StaffProfileConfig>) {
    update(
      "profiles",
      profiles.map((profile, profileIndex) =>
        profileIndex === index ? { ...profile, ...patch } : profile,
      ),
    );
  }

  function addProfile() {
    if (profiles.length >= 8) return;
    update("profiles", [
      ...profiles,
      {
        imageUrl: "",
        name: "",
        role: "",
        description: "",
        accentColor: defaultAccentColors[profiles.length % defaultAccentColors.length],
      },
    ]);
  }

  function removeProfile(index: number) {
    setCollapsedProfiles((current) =>
      current
        .filter((currentIndex) => currentIndex !== index)
        .map((currentIndex) => (currentIndex > index ? currentIndex - 1 : currentIndex)),
    );

    update(
      "profiles",
      profiles.filter((_, profileIndex) => profileIndex !== index),
    );
  }

  function toggleProfile(index: number) {
    setCollapsedProfiles((current) =>
      current.includes(index)
        ? current.filter((currentIndex) => currentIndex !== index)
        : [...current, index],
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-staff-title">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-staff-title"
            value={(config.title as string) ?? "スタッフ紹介"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <FontSelect
          id="cfg-staff-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-staff-body">{t("configEditor.bodyText")}</Label>
        <Textarea
          id="cfg-staff-body"
          rows={3}
          value={(config.body as string) ?? "担当者やスタッフのプロフィールを表示します。"}
          onChange={(e) => update("body", e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <Switch
          id="cfg-staff-showClock"
          checked={showClock}
          onCheckedChange={(value) => update("showClock", value)}
        />
        <Label htmlFor="cfg-staff-showClock">{t("configEditor.showClock")}</Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-staff-objectFit">{t("configEditor.mediaMode")}</Label>
        <Select value={objectFit} onValueChange={(value) => update("objectFit", value)}>
          <SelectTrigger id="cfg-staff-objectFit" className="w-full sm:max-w-72">
            <SelectValue>
              {objectFit === "cover"
                ? t("configEditor.objectFitCover")
                : t("configEditor.objectFitContain")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">{t("configEditor.objectFitCover")}</SelectItem>
            <SelectItem value="contain">{t("configEditor.objectFitContain")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorInput
          id="cfg-staff-background"
          label="背景色"
          value={(config.backgroundColor as string) ?? "#f8fafc"}
          onChange={(value) => update("backgroundColor", value)}
        />
        <ColorInput
          id="cfg-staff-card"
          label="カード背景色"
          value={(config.cardBackgroundColor as string) ?? "#ffffff"}
          onChange={(value) => update("cardBackgroundColor", value)}
        />
        <ColorInput
          id="cfg-staff-title-color"
          label={t("configEditor.titleColor")}
          value={(config.titleColor as string) ?? "#0f172a"}
          onChange={(value) => update("titleColor", value)}
        />
        <ColorInput
          id="cfg-staff-body-color"
          label={t("configEditor.bodyColor")}
          value={(config.bodyColor as string) ?? "#475569"}
          onChange={(value) => update("bodyColor", value)}
        />
        <ColorInput
          id="cfg-staff-card-text-color"
          label="カード文字色"
          value={(config.cardTextColor as string) ?? "#0f172a"}
          onChange={(value) => update("cardTextColor", value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">スタッフカード</h4>
            <p className="text-xs text-muted-foreground">
              最大8人まで登録できます。画像・名前・肩書き・説明のいずれかを入力すると表示されます。
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addProfile} disabled={profiles.length >= 8}>
            <Plus className="size-4" />
            スタッフを追加
          </Button>
        </div>

        <div className="space-y-3">
          {profiles.map((profile, index) => {
            const isCollapsed = collapsedProfiles.includes(index);
            const profileName = profile.name.trim();
            const selectedImageLabel = profile.imageUrl
              ? imageOptionLabel(profile.imageUrl, imageMedia, t)
              : "画像なし";

            return (
              <div key={index} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <h5 className="shrink-0 text-sm font-semibold">スタッフ {index + 1}</h5>
                    {profileName && (
                      <span className="truncate text-sm text-muted-foreground">
                        {profileName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleProfile(index)}
                      aria-label={
                        isCollapsed
                          ? t("schedule.details.expand")
                          : t("schedule.details.collapse")
                      }
                    >
                      {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeProfile(index)}
                      disabled={profiles.length <= 1}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cfg-staff-image-${index}`}>画像</Label>
                        <Select
                          value={profile.imageUrl || "__none__"}
                          onValueChange={(value) => {
                            if (!value) return;
                            updateProfile(index, { imageUrl: value === "__none__" ? "" : value });
                          }}
                        >
                          <SelectTrigger id={`cfg-staff-image-${index}`}>
                            <SelectValue>{selectedImageLabel}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">画像なし</SelectItem>
                            {imageMedia.map((media) => (
                              <SelectItem key={media.id} value={media.filePath}>
                                {imageOptionLabel(media.filePath, imageMedia, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <ColorInput
                        id={`cfg-staff-accent-${index}`}
                        label="アクセント色"
                        value={profile.accentColor}
                        onChange={(value) => updateProfile(index, { accentColor: value })}
                      />

                      <div className="space-y-1.5">
                        <Label htmlFor={`cfg-staff-name-${index}`}>スタッフ名</Label>
                        <Input
                          id={`cfg-staff-name-${index}`}
                          value={profile.name}
                          maxLength={60}
                          onChange={(e) => updateProfile(index, { name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`cfg-staff-role-${index}`}>肩書き</Label>
                        <Input
                          id={`cfg-staff-role-${index}`}
                          value={profile.role}
                          maxLength={60}
                          onChange={(e) => updateProfile(index, { role: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`cfg-staff-description-${index}`}>説明</Label>
                      <Textarea
                        id={`cfg-staff-description-${index}`}
                        rows={3}
                        maxLength={240}
                        value={profile.description}
                        onChange={(e) => updateProfile(index, { description: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
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

  return t("schedule.imageNumber", { number: index + 1 });
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