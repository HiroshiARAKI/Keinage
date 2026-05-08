// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { QRCodeSVG } from "qrcode.react";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps } from "@/types";

interface QrEntryConfig {
  value: string;
  label: string;
}

interface QrInfoConfig {
  title: string;
  body: string;
  titleFontSize: number;
  titleColor: string;
  bodyFontSize: number;
  bodyColor: string;
  labelFontSize: number;
  labelColor: string;
  qrSize: number;
  qrPosition: "left" | "right";
  qrLayout: "horizontal" | "vertical";
  fontFamily: string;
  qrs: QrEntryConfig[];
}

export const qrInfoDefaultConfig: QrInfoConfig = {
  title: "詳しくはこちら",
  body: "QRコードを読み取って詳細をご確認ください。",
  titleFontSize: 56,
  titleColor: "#111827",
  bodyFontSize: 28,
  bodyColor: "#374151",
  labelFontSize: 26,
  labelColor: "#0f172a",
  qrSize: 220,
  qrPosition: "right",
  qrLayout: "horizontal",
  fontFamily: "",
  qrs: [
    { value: "https://example.com", label: "Webサイト" },
    { value: "", label: "" },
  ],
};

function parseConfig(raw: unknown): QrInfoConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<QrInfoConfig>;
  const qrs = (Array.isArray(cfg.qrs) ? cfg.qrs : qrInfoDefaultConfig.qrs)
    .slice(0, 2)
    .map((qr) => ({
      value: typeof qr.value === "string" ? qr.value.slice(0, 512) : "",
      label: typeof qr.label === "string" ? qr.label : "",
    }));
  return {
    ...qrInfoDefaultConfig,
    ...cfg,
    qrSize: Math.min(420, Math.max(120, Number(cfg.qrSize) || qrInfoDefaultConfig.qrSize)),
    qrs,
  };
}

export default function QrInfoBoard({ board }: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const activeQrs = config.qrs.filter((qr) => qr.value.trim());
  const qrPanel = (
    <div
      className={`flex gap-6 ${
        config.qrLayout === "vertical" ? "flex-col" : "flex-row"
      } items-center justify-center`}
    >
      {activeQrs.map((qr, index) => (
        <div key={index} className="flex flex-col items-center gap-3 rounded-xl bg-white p-6 shadow-lg">
          <QRCodeSVG value={qr.value} size={config.qrSize} marginSize={2} />
          {qr.label && (
            <div
              className="text-center font-bold"
              style={{ color: config.labelColor, fontSize: config.labelFontSize }}
            >
              {qr.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const textPanel = (
    <div className="flex min-w-0 flex-1 flex-col justify-center">
      <h1
        className="font-black tracking-normal"
        style={{ color: config.titleColor, fontSize: config.titleFontSize }}
      >
        {config.title || board.name}
      </h1>
      {config.body && (
        <p
          className="mt-6 max-w-4xl leading-relaxed"
          style={{ color: config.bodyColor, fontSize: config.bodyFontSize }}
        >
          {config.body}
        </p>
      )}
    </div>
  );

  return (
    <div
      className="flex h-screen w-screen gap-10 bg-[#f8fafc] p-12"
      style={{ fontFamily: config.fontFamily || undefined }}
    >
      {config.fontFamily && <GoogleFontLoader fonts={[config.fontFamily]} />}
      {config.qrPosition === "left" ? (
        <>
          <div className="flex w-[36%] items-center justify-center">{qrPanel}</div>
          {textPanel}
        </>
      ) : (
        <>
          {textPanel}
          <div className="flex w-[36%] items-center justify-center">{qrPanel}</div>
        </>
      )}
    </div>
  );
}
