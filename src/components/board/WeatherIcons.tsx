// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { useId, type CSSProperties } from "react";
import type { WeatherCondition } from "@/lib/weather/types";

interface IconProps {
  className?: string;
  style?: CSSProperties;
}

const PARTLY_CLOUDY_CLOUD_PATH =
  "M17 51h31c7 0 12-5 12-11s-5-11-12-11h-2c-3-6-8-9-15-8-6 1-10 5-11 12h-3c-7 0-12 4-12 9s5 9 12 9Z";

function SunShape() {
  const rays = [
    [32, 7, 32, 14],
    [32, 50, 32, 57],
    [7, 32, 14, 32],
    [50, 32, 57, 32],
    [14.5, 14.5, 19.5, 19.5],
    [44.5, 44.5, 49.5, 49.5],
    [49.5, 14.5, 44.5, 19.5],
    [19.5, 44.5, 14.5, 49.5],
  ];

  return (
    <>
      <circle cx="32" cy="32" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
      {rays.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
        />
      ))}
    </>
  );
}

function PartlyCloudySun() {
  return (
    <>
      <circle
        cx="19"
        cy="18"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      {[
        [19, 2, 19, 6],
        [3, 18, 7, 18],
        [31, 18, 35, 18],
        [8, 7, 11, 10],
        [27, 10, 30, 7],
        [8, 29, 11, 26],
      ].map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
        />
      ))}
    </>
  );
}

function CloudShape({
  x = 7,
  y = 21,
  fill = "none",
  stroke = "currentColor",
  strokeWidth = 3,
}: {
  x?: number;
  y?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <path
      d={`M${x + 9} ${y + 26}h28c8 0 14-5 14-12s-6-12-13-12h-2C${x + 33} ${y - 7} ${x + 14} ${y - 6} ${x + 11} ${y + 8} ${x + 4} ${y + 9} ${x} ${y + 14} ${x} ${y + 20}c0 4 4 6 9 6Z`}
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    />
  );
}

export function WeatherConditionIcon({
  condition,
  className,
  style,
}: IconProps & { condition: WeatherCondition }) {
  const cloudMaskId = useId();

  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      viewBox="0 0 64 64"
      fill="none"
    >
      {condition === "clear" && <SunShape />}
      {condition === "partly-cloudy" && (
        <>
          <mask
            id={cloudMaskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="64"
            height="64"
          >
            <rect width="64" height="64" fill="white" />
            <path
              d={PARTLY_CLOUDY_CLOUD_PATH}
              fill="black"
              stroke="black"
              strokeLinejoin="round"
              strokeWidth={3}
            />
          </mask>
          <g mask={`url(#${cloudMaskId})`}>
            <PartlyCloudySun />
          </g>
          <path
            d={PARTLY_CLOUDY_CLOUD_PATH}
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </>
      )}
      {condition === "cloudy" && <CloudShape />}
      {condition === "rain" && (
        <>
          <CloudShape y={14} />
          {[18, 31, 44].map((x) => (
            <line
              key={x}
              x1={x}
              y1="46"
              x2={x - 3}
              y2="55"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
          ))}
        </>
      )}
      {condition === "snow" && (
        <>
          <path
            d="M32 10c-8 0-13 5-13 11 0 5 2 8 6 11-7 3-11 9-11 16 0 8 8 12 18 12s18-4 18-12c0-7-4-13-11-16 4-3 6-6 6-11 0-6-5-11-13-11Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d="M18 37 8 31m38 6 10-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </>
      )}
      {condition === "thunder" && (
        <>
          <CloudShape y={12} />
          <path
            d="M34 42h-8l-3 10h8l-2 9 13-15h-8Z"
            fill="currentColor"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </>
      )}
      {condition === "fog" && (
        <>
          <CloudShape y={8} />
          {[43, 50, 57].map((y, index) => (
            <line
              key={y}
              x1={index === 1 ? 13 : 19}
              y1={y}
              x2={index === 1 ? 51 : 45}
              y2={y}
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
          ))}
        </>
      )}
      {condition === "unknown" && (
        <>
          <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="3" />
          <path
            d="M25 25c.5-4 3.5-6 7-6 4.5 0 7 2.5 7 6 0 3-1.8 4.8-4.8 6.5-2.8 1.6-3.2 3-3.2 5.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
          />
          <circle cx="31" cy="43" r="1.75" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function UmbrellaIcon({ className, style }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M4 15c1-7 6-11 12-11s11 4 12 11c-3-2-5-2-8 0-3-2-5-2-8 0-3-2-5-2-8 0Z"
        fill="currentColor"
      />
      <path
        d="M16 4v19c0 4 5 5 7 1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}
