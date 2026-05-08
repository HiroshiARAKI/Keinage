// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface TickerTextProps {
  messages: string[];
  /** Scroll speed in pixels per second */
  speed?: number;
  className?: string;
  /** Font family for ticker text */
  fontFamily?: string;
}

export function TickerText({
  messages,
  speed = 60,
  className = "",
  fontFamily,
}: TickerTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ready, setReady] = useState(false);

  const text = messages.length > 0 ? messages.join("　　　") : "";

  const measure = useCallback(() => {
    if (!containerRef.current || !measureRef.current) return;
    const cw = containerRef.current.offsetWidth;
    const tw = measureRef.current.offsetWidth;
    if (cw > 0 && tw > 0) {
      setContainerWidth(cw);
      setContentWidth(tw);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is laid out before measuring
    const raf = requestAnimationFrame(() => {
      setReady(false);
      measure();
    });
    return () => cancelAnimationFrame(raf);
  }, [text, fontFamily, measure]);

  // Re-measure on window resize
  useEffect(() => {
    const handleResize = () => {
      setReady(false);
      requestAnimationFrame(measure);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measure]);

  if (!text) {
    return null;
  }

  const totalDistance = contentWidth + containerWidth;
  const duration = totalDistance / speed;
  const fontStyle = fontFamily ? { fontFamily } : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden whitespace-nowrap ${className}`}
    >
      {/* Hidden span for measurement — always in DOM */}
      <span
        ref={measureRef}
        className="pointer-events-none invisible absolute whitespace-nowrap"
        style={fontStyle}
        aria-hidden
      >
        {text}
      </span>

      {/* Animated ticker — only rendered after measurement */}
      {ready && (
        <motion.div
          initial={{ x: containerWidth }}
          animate={{ x: -contentWidth }}
          transition={{
            duration,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
          }}
          key={text}
        >
          <span className="inline-block" style={fontStyle}>
            {text}
          </span>
        </motion.div>
      )}
    </div>
  );
}
