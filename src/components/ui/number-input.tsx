// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

function formatNumericValue(value: number, allowDecimal: boolean) {
  if (!Number.isFinite(value)) return "";
  return allowDecimal ? String(value) : String(Math.trunc(value));
}

function clampNumericValue(value: number, min?: number, max?: number) {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  allowDecimal,
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimal?: boolean;
}) {
  const shouldAllowDecimal = allowDecimal ?? (step !== undefined && !Number.isInteger(step));
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState("");
  const displayValue = isEditing
    ? draftValue
    : formatNumericValue(value, shouldAllowDecimal);
  const numericPattern = shouldAllowDecimal ? /^\d*(?:\.\d*)?$/ : /^\d*$/;

  function commit(rawValue: string) {
    const parsed = Number(rawValue);
    if (!rawValue || !Number.isFinite(parsed)) {
      setDraftValue(formatNumericValue(value, shouldAllowDecimal));
      return;
    }

    const normalized = shouldAllowDecimal ? parsed : Math.trunc(parsed);
    const nextValue = clampNumericValue(normalized, min, max);
    setDraftValue(formatNumericValue(nextValue, shouldAllowDecimal));
    if (nextValue !== value) {
      onValueChange(nextValue);
    }
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode={shouldAllowDecimal ? "decimal" : "numeric"}
      value={displayValue}
      min={min}
      max={max}
      step={step}
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={className}
      onFocus={(event) => {
        setIsEditing(true);
        setDraftValue(formatNumericValue(value, shouldAllowDecimal));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        commit(event.currentTarget.value);
        setIsEditing(false);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
      onChange={(event) => {
        const rawValue = event.target.value.trim();
        if (!numericPattern.test(rawValue)) return;

        if (rawValue === "" || rawValue === ".") {
          setDraftValue(rawValue);
          return;
        }

        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) return;

        if (max !== undefined && parsed > max) {
          setDraftValue(formatNumericValue(max, shouldAllowDecimal));
          onValueChange(max);
          return;
        }

        setDraftValue(rawValue);
        if (min === undefined || parsed >= min) {
          onValueChange(shouldAllowDecimal ? parsed : Math.trunc(parsed));
        }
      }}
    />
  );
}
