// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

import { KeinageLogo } from "@/components/KeinageLogo";

/**
 * Free plan attribution shown inside the board canvas.
 * This client-rendered notice is not a tamper-proof DRM control.
 */
export function WatermarkOverlay() {
  return (
    <div
      className="pointer-events-none absolute bottom-[clamp(1rem,2.5vh,2rem)] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 text-white opacity-30 mix-blend-difference [--logo-screen:rgba(0,0,0,0.75)]"
      aria-label="Powered by Keinage"
    >
      <KeinageLogo className="h-8 w-16 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] sm:h-9 sm:w-[4.5rem]" />
      <span className="whitespace-nowrap text-[0.65rem] font-semibold tracking-normal drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)] sm:text-[0.7rem]">
        Powered by Keinage
      </span>
    </div>
  );
}
