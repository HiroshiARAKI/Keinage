// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

import { KeinageLogo } from "@/components/KeinageLogo";
import type { MediaItem } from "@/types";

interface ScheduledMediaFallbackProps {
  item: MediaItem | null;
  objectFit: "contain" | "cover";
}

export function ScheduledMediaFallback({
  item,
  objectFit,
}: ScheduledMediaFallbackProps) {
  const fitClass = objectFit === "cover" ? "object-cover" : "object-contain";

  if (item?.type === "image") {
    return (
      <div className="h-full w-full bg-black">
        <img src={item.filePath} alt="" className={`h-full w-full ${fitClass}`} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black text-white [--logo-screen:#000000]">
      <div className="flex flex-col items-center gap-4 opacity-70">
        <KeinageLogo className="h-28 w-56" />
        <span className="text-xl font-semibold tracking-normal">Keinage</span>
      </div>
    </div>
  );
}
