// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DateTimeClock } from "@/components/board/DateTimeClock";
import { WeatherDisplay } from "@/components/board/WeatherDisplay";
import { GoogleFontLoader } from "@/components/board/GoogleFontLoader";
import type { BoardTemplateProps } from "@/types";

interface RetroRowContent {
  left: string;
  right: string;
}

/** Default config for the Retro Board template */
export const retroBoardDefaultConfig = {
  displayColor: "green" as "green" | "orange" | "white",
  rows: 5,
  fontSize: 36,
  flipSpeed: 0.08,
  switchInterval: 5,
  showClock: false,
  showWeather: false,
  fontFamily: "",
  columnMode: "single" as "single" | "two",
  leftColumnPercent: 50,
  rowContents: [] as RetroRowContent[],
};

type RetroBoardConfig = typeof retroBoardDefaultConfig;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseConfig(raw: unknown): RetroBoardConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<RetroBoardConfig>;
  const rows = typeof cfg.rows === "number" ? cfg.rows : retroBoardDefaultConfig.rows;
  const fontSize = typeof cfg.fontSize === "number" ? cfg.fontSize : retroBoardDefaultConfig.fontSize;
  const leftColumnPercent =
    typeof cfg.leftColumnPercent === "number"
      ? cfg.leftColumnPercent
      : retroBoardDefaultConfig.leftColumnPercent;

  return {
    ...retroBoardDefaultConfig,
    ...cfg,
    rows: clamp(rows, 1, 20),
    fontSize: clamp(fontSize, 18, 96),
    leftColumnPercent: clamp(leftColumnPercent, 20, 80),
    columnMode: cfg.columnMode === "two" ? "two" : "single",
    rowContents: normalizeRowContents(cfg.rowContents, clamp(rows, 1, 20)),
  };
}

function normalizeRowContents(value: unknown, rows: number): RetroRowContent[] {
  const rawRows = Array.isArray(value) ? value : [];
  return Array.from({ length: rows }, (_, index) => {
    const row = rawRows[index];
    if (!row || typeof row !== "object") {
      return { left: "", right: "" };
    }

    const raw = row as { left?: unknown; right?: unknown; text?: unknown };
    return {
      left:
        typeof raw.left === "string"
          ? raw.left
          : typeof raw.text === "string"
            ? raw.text
            : "",
      right: typeof raw.right === "string" ? raw.right : "",
    };
  });
}

const COLOR_MAP: Record<string, { text: string; glow: string }> = {
  green: { text: "#39ff14", glow: "0 0 8px #39ff14, 0 0 20px #39ff1466" },
  orange: { text: "#ff8c00", glow: "0 0 8px #ff8c00, 0 0 20px #ff8c0066" },
  white: { text: "#f0f0f0", glow: "0 0 8px #f0f0f0, 0 0 20px #f0f0f066" },
};

/** Flip-style single character animation */
function FlipChar({
  char,
  delay,
  color,
  glow,
  flipSpeed,
}: {
  char: string;
  delay: number;
  color: string;
  glow: string;
  flipSpeed: number;
}) {
  return (
    <motion.span
      initial={{ rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{
        duration: flipSpeed,
        delay,
        ease: "easeOut",
      }}
      className="inline-block"
      style={{
        color,
        textShadow: glow,
        perspective: "400px",
        transformStyle: "preserve-3d",
      }}
    >
      {char === " " ? "\u00A0" : char}
    </motion.span>
  );
}

/** A single row that flips in character-by-character */
function RetroRow({
  row,
  color,
  glow,
  flipSpeed,
  fontSize,
  columnMode,
  leftColumnPercent,
}: {
  row: RetroRowContent;
  color: string;
  glow: string;
  flipSpeed: number;
  fontSize: number;
  columnMode: "single" | "two";
  leftColumnPercent: number;
}) {
  const leftText = row.left || "—";
  const rightText = row.right;
  const rightColumnPercent = 100 - leftColumnPercent;
  const animationKey = `${leftText}|${rightText}`;

  return (
    <div className="flex items-center border-b border-white/5 px-6 py-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={animationKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={
            columnMode === "two"
              ? "grid w-full overflow-hidden font-bold tracking-widest"
              : "flex overflow-hidden font-bold tracking-widest"
          }
          style={
            columnMode === "two"
              ? {
                  fontSize,
                  lineHeight: 1.25,
                  gridTemplateColumns: `${leftColumnPercent}% ${rightColumnPercent}%`,
                }
              : { fontSize, lineHeight: 1.25 }
          }
        >
          {columnMode === "two" ? (
            <>
              <div className="min-w-0 overflow-hidden pr-4 whitespace-nowrap">
                <FlipText
                  text={leftText}
                  color={color}
                  glow={glow}
                  flipSpeed={flipSpeed}
                  keyPrefix={`${animationKey}-left`}
                />
              </div>
              <div className="min-w-0 overflow-hidden whitespace-nowrap text-right">
                <FlipText
                  text={rightText}
                  color={color}
                  glow={glow}
                  flipSpeed={flipSpeed}
                  keyPrefix={`${animationKey}-right`}
                />
              </div>
            </>
          ) : (
            <FlipText
              text={leftText}
              color={color}
              glow={glow}
              flipSpeed={flipSpeed}
              keyPrefix={leftText}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FlipText({
  text,
  color,
  glow,
  flipSpeed,
  keyPrefix,
}: {
  text: string;
  color: string;
  glow: string;
  flipSpeed: number;
  keyPrefix: string;
}) {
  return (
    <>
      {text.split("").map((char, i) => (
        <FlipChar
          key={`${keyPrefix}-${i}`}
          char={char}
          delay={i * flipSpeed}
          color={color}
          glow={glow}
          flipSpeed={flipSpeed}
        />
      ))}
    </>
  );
}

function splitRetroColumns(text: string): [string, string] {
  if (text.includes("|")) {
    const [left, ...right] = text.split("|");
    return [left.trim(), right.join("|").trim()];
  }

  if (text.includes("\t")) {
    const [left, ...right] = text.split("\t");
    return [left.trim(), right.join("\t").trim()];
  }

  return [text, ""];
}

function messageToRowContent(content: string): RetroRowContent {
  const [left, right] = splitRetroColumns(content);
  return { left, right };
}

export default function RetroBoard({
  board,
  messages,
}: BoardTemplateProps) {
  const config = parseConfig(board.config);
  const { text: color, glow } = COLOR_MAP[config.displayColor] ?? COLOR_MAP.green;
  const hasConfiguredRows = config.rowContents.some(
    (row) => row.left.trim() || row.right.trim(),
  );

  const sorted = [...messages].sort((a, b) => b.priority - a.priority);
  const totalMessages = hasConfiguredRows ? 0 : sorted.length;

  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (totalMessages <= config.rows) return;
    const timer = setInterval(() => {
      setOffset((prev) => (prev + config.rows) % totalMessages);
    }, config.switchInterval * 1000);
    return () => clearInterval(timer);
  }, [totalMessages, config.rows, config.switchInterval]);

  // Build visible rows (circular)
  const visibleRows: RetroRowContent[] = hasConfiguredRows
    ? config.rowContents
    : Array.from({ length: config.rows }, (_, index) =>
        totalMessages === 0
          ? { left: "", right: "" }
          : messageToRowContent(sorted[(offset + index) % totalMessages].content),
      );

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0a0a]" style={{ fontFamily: config.fontFamily || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
      {config.fontFamily && (
        <GoogleFontLoader fonts={[config.fontFamily]} />
      )}
      {/* Header bar */}
      <div
        className="flex items-center justify-between border-b-2 px-6 py-3"
        style={{ borderColor: color }}
      >
        <span
          className="text-sm font-bold uppercase tracking-[0.3em]"
          style={{ color, textShadow: glow }}
        >
          {board.name}
        </span>
        <div className="flex items-center gap-4">
          <span
            className="text-sm tracking-wider opacity-70"
            style={{ color }}
          >
            ● LIVE
          </span>
        </div>
      </div>

      {/* Clock & Weather bar */}
      {(config.showClock || config.showWeather) && (
        <div
          className="flex items-center justify-between border-b px-6 py-1"
          style={{ borderColor: color + "40" }}
        >
          <div className="flex-1">
            {config.showWeather && (
              <WeatherDisplay
                boardId={board.id}
                color={color}
                bgOpacity={0}
                fontFamily={config.fontFamily || undefined}
              />
            )}
          </div>
          {config.showClock && (
            <DateTimeClock
              timeFontSize={18}
              color={color}
              bgOpacity={0}
              layout="compact"
              fontFamily={config.fontFamily || undefined}
            />
          )}
        </div>
      )}

      {/* Message rows */}
      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={offset}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {visibleRows.map((row, i) => (
              <RetroRow
                key={`${offset}-${i}`}
                row={row}
                color={color}
                glow={glow}
                flipSpeed={config.flipSpeed}
                fontSize={config.fontSize}
                columnMode={config.columnMode}
                leftColumnPercent={config.leftColumnPercent}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom decorative line */}
      <div className="h-1" style={{ backgroundColor: color, opacity: 0.3 }} />
    </div>
  );
}
