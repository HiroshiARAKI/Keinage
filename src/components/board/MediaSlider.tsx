// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { clampMediaDuration, DEFAULT_MEDIA_DURATION_SECONDS } from "@/lib/media-duration";
import { thumbUrl } from "@/lib/utils";
import type { MediaItem } from "@/types";

/** How many upcoming images to preload ahead of the current slide. */
const PRELOAD_AHEAD = 2;

interface MediaSliderProps {
  mediaItems: MediaItem[];
  /** How media fits the container: "contain" (show all) or "cover" (fill, may crop) */
  objectFit?: "contain" | "cover";
}

interface DeferredVideoSlideProps {
  item: MediaItem;
  fitClass: string;
  loop: boolean;
  onEnded: () => void;
}

function DisabledVideoSlide({ item }: { item: MediaItem }) {
  const { t } = useLocale();
  const messageKey =
    item.playbackStatus === "plan_resolution_exceeded"
      ? "board.videoUnavailableResolution"
      : "board.videoUnavailablePlan";

  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-6 text-center text-white">
      <div className="max-w-lg rounded-lg border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
        <p className="text-lg font-semibold">{t("board.videoUnavailableTitle")}</p>
        <p className="mt-2 text-sm text-white/75">{t(messageKey)}</p>
      </div>
    </div>
  );
}

function DeferredVideoSlide({ item, fitClass, loop, onEnded }: DeferredVideoSlideProps) {
  const { t } = useLocale();
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const poster = thumbUrl(item.filePath);
  const showLoading = !isPlaying && !videoFailed;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setShouldLoad(true);
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-full w-full bg-black">
      <div className="absolute inset-0 bg-black" aria-hidden />
      {!isPlaying && !posterFailed && (
        <img
          src={poster}
          alt=""
          className={`absolute inset-0 z-10 h-full w-full ${fitClass}`}
          onError={() => setPosterFailed(true)}
        />
      )}
      <video
        ref={videoRef}
        src={shouldLoad && !videoFailed ? item.filePath : undefined}
        poster={posterFailed ? undefined : poster}
        preload="metadata"
        className={`absolute inset-0 z-20 h-full w-full transition-opacity duration-300 ${fitClass} ${
          isPlaying ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        loop={loop}
        muted
        playsInline
        onCanPlay={() => {
          void videoRef.current?.play().catch(() => {
            // Muted autoplay should normally succeed; leave the poster visible if it does not.
          });
        }}
        onPlaying={() => setIsPlaying(true)}
        onEnded={onEnded}
        onError={() => {
          setVideoFailed(true);
          console.error("[MediaSlider] Failed to load video", {
            mediaId: item.id,
            filePath: item.filePath,
          });
        }}
      />
      {showLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/20 text-white">
          <div className="size-10 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <span className="rounded bg-black/35 px-3 py-1 text-sm font-medium">
            {t("common.loading")}
          </span>
        </div>
      )}
    </div>
  );
}

export function MediaSlider({
  mediaItems,
  objectFit = "contain",
}: MediaSliderProps) {
  const { t } = useLocale();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const preloadedRef = useRef<Set<string>>(new Set());
  const videoPreloadRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const currentImageRef = useRef<HTMLImageElement | null>(null);

  const advance = useCallback(() => {
    setImageLoaded(false);
    setCurrentIndex((prev) => (prev + 1) % mediaItems.length);
  }, [mediaItems.length]);

  const safeCurrentIndex =
    mediaItems.length === 0 ? 0 : Math.min(currentIndex, mediaItems.length - 1);

  // --- Preload upcoming media ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;

    for (let offset = 1; offset <= PRELOAD_AHEAD; offset++) {
      const idx = (safeCurrentIndex + offset) % mediaItems.length;
      const item = mediaItems[idx];
      if (!item || preloadedRef.current.has(item.filePath)) continue;

      preloadedRef.current.add(item.filePath);
      if (item.type === "image") {
        const img = new Image();
        img.src = item.filePath;
      } else if (item.playbackStatus === undefined || item.playbackStatus === "available") {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = item.filePath;
        video.load();
        videoPreloadRef.current.set(item.filePath, video);
      }
    }
  }, [safeCurrentIndex, mediaItems]);

  const current = mediaItems[safeCurrentIndex];

  useEffect(() => {
    if (!current) return;

    const loaded =
      current.type !== "image" || Boolean(currentImageRef.current?.complete);
    const raf = requestAnimationFrame(() => setImageLoaded(loaded));

    return () => cancelAnimationFrame(raf);
  }, [current]);

  // --- Auto-advance timer (starts only after the current image has loaded) ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;

    const item = mediaItems[safeCurrentIndex];
    if (!item) return;

    // For videos the advance is handled by the video-specific effect/callback.
    if (item.type === "video") return;

    // Wait until the browser has decoded and painted the current image
    if (!imageLoaded) return;

    const ms = clampMediaDuration(item.duration ?? DEFAULT_MEDIA_DURATION_SECONDS) * 1000;
    const timer = setTimeout(advance, ms);
    return () => clearTimeout(timer);
  }, [safeCurrentIndex, mediaItems, advance, imageLoaded]);

  // --- Video timer mode ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;

    const item = mediaItems[safeCurrentIndex];
    if (item?.type !== "video") return;
    if (item.playbackMode === "until-ended") return;

    const ms = clampMediaDuration(item.duration ?? DEFAULT_MEDIA_DURATION_SECONDS) * 1000;
    const timer = setTimeout(advance, ms);
    return () => clearTimeout(timer);
  }, [safeCurrentIndex, mediaItems, advance]);

  if (mediaItems.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/80 text-white/60">
        <p className="text-lg">{t("board.noMedia")}</p>
      </div>
    );
  }
  const fitClass = objectFit === "cover" ? "object-cover" : "object-contain";
  if (!current) {
    return null;
  }

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${current.id}:${current.filePath}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          {current.type === "video" ? (
            current.playbackStatus && current.playbackStatus !== "available" ? (
              <DisabledVideoSlide item={current} />
            ) : (
              <DeferredVideoSlide
                item={current}
                fitClass={fitClass}
                loop={mediaItems.length <= 1 || current.playbackMode !== "until-ended"}
                onEnded={advance}
              />
            )
          ) : (
            <img
              ref={currentImageRef}
              src={current.filePath}
              alt=""
              className={`h-full w-full ${fitClass}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
