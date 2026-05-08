// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FontSelect, numberValue, useLoadAllGoogleFonts } from "./shared";

interface QrConfig {
  value: string;
  label: string;
}

interface QrInfoConfigEditorProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function QrInfoConfigEditor({
  config,
  onChange,
}: QrInfoConfigEditorProps) {
  useLoadAllGoogleFonts();
  const { t } = useLocale();
  const qrs = normalizeQrs(config.qrs);
  const fontFamily = (config.fontFamily as string) ?? "";
  const qrPosition = ((config.qrPosition as string) ?? "left") === "right" ? "right" : "left";
  const qrLayout = ((config.qrLayout as string) ?? "horizontal") === "vertical" ? "vertical" : "horizontal";

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateQr(index: number, patch: Partial<QrConfig>) {
    update(
      "qrs",
      qrs.map((qr, qrIndex) => (qrIndex === index ? { ...qr, ...patch } : qr)),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-qr-title">{t("configEditor.titleText")}</Label>
          <Input
            id="cfg-qr-title"
            value={(config.title as string) ?? "ご案内"}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>
        <FontSelect
          id="cfg-qr-font"
          value={fontFamily}
          onChange={(value) => update("fontFamily", value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cfg-qr-body">{t("configEditor.bodyText")}</Label>
        <Textarea
          id="cfg-qr-body"
          value={(config.body as string) ?? "スマートフォンでQRコードを読み取ってください。"}
          onChange={(e) => update("body", e.target.value)}
          rows={4}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-qr-position">{t("configEditor.qrPosition")}</Label>
          <Select
            value={qrPosition}
            onValueChange={(value) => {
              if (!value) return;
              update("qrPosition", value);
            }}
          >
            <SelectTrigger id="cfg-qr-position">
              <SelectValue>
                {qrPosition === "right"
                  ? t("configEditor.qrPositionRight")
                  : t("configEditor.qrPositionLeft")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">{t("configEditor.qrPositionLeft")}</SelectItem>
              <SelectItem value="right">{t("configEditor.qrPositionRight")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-qr-layout">{t("configEditor.qrLayout")}</Label>
          <Select
            value={qrLayout}
            onValueChange={(value) => {
              if (!value) return;
              update("qrLayout", value);
            }}
          >
            <SelectTrigger id="cfg-qr-layout">
              <SelectValue>
                {qrLayout === "vertical"
                  ? t("configEditor.qrLayoutVertical")
                  : t("configEditor.qrLayoutHorizontal")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">{t("configEditor.qrLayoutHorizontal")}</SelectItem>
              <SelectItem value="vertical">{t("configEditor.qrLayoutVertical")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FontNumber id="cfg-qr-titleFontSize" label={t("configEditor.titleFontSize")} value={numberValue(config.titleFontSize, 62)} onChange={(value) => update("titleFontSize", value)} />
        <FontNumber id="cfg-qr-bodyFontSize" label={t("configEditor.bodyFontSize")} value={numberValue(config.bodyFontSize, 34)} onChange={(value) => update("bodyFontSize", value)} />
        <FontNumber id="cfg-qr-labelFontSize" label={t("configEditor.labelFontSize")} value={numberValue(config.labelFontSize, 26)} onChange={(value) => update("labelFontSize", value)} />
        <FontNumber id="cfg-qr-size" label={t("configEditor.qrSize")} value={numberValue(config.qrSize, 220)} min={120} max={420} onChange={(value) => update("qrSize", value)} />
        <ColorInput id="cfg-qr-titleColor" label={t("configEditor.titleColor")} value={(config.titleColor as string) ?? "#111827"} onChange={(value) => update("titleColor", value)} />
        <ColorInput id="cfg-qr-bodyColor" label={t("configEditor.bodyColor")} value={(config.bodyColor as string) ?? "#374151"} onChange={(value) => update("bodyColor", value)} />
        <ColorInput id="cfg-qr-labelColor" label={t("configEditor.labelColor")} value={(config.labelColor as string) ?? "#0f172a"} onChange={(value) => update("labelColor", value)} />
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">{t("configEditor.qrCodes")}</h4>
        {qrs.map((qr, index) => {
          const hasNonUrlValue =
            qr.value.trim() !== "" && !/^https?:\/\//i.test(qr.value.trim());

          return (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                <Input
                  value={qr.value}
                  maxLength={512}
                  placeholder={t("configEditor.qrValue")}
                  onChange={(e) => updateQr(index, { value: e.target.value })}
                />
                <Input
                  value={qr.label}
                  placeholder={t("configEditor.qrLabel")}
                  onChange={(e) => updateQr(index, { label: e.target.value })}
                />
              </div>
              <p className={hasNonUrlValue ? "text-xs text-amber-700" : "text-xs text-muted-foreground"}>
                {hasNonUrlValue
                  ? t("configEditor.qrUrlWarning")
                  : t("configEditor.qrUrlHint")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeQrs(value: unknown): QrConfig[] {
  const rawQrs = Array.isArray(value) ? value : [];
  const qrs = rawQrs.slice(0, 2).map((raw) => {
    const qr = raw && typeof raw === "object" ? (raw as Partial<QrConfig>) : {};
    return {
      value: (qr.value ?? "").slice(0, 512),
      label: qr.label ?? "",
    };
  });

  while (qrs.length < 2) {
    qrs.push({ value: "", label: "" });
  }

  return qrs;
}

function FontNumber({
  id,
  label,
  value,
  min = 12,
  max = 120,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || value)))}
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
