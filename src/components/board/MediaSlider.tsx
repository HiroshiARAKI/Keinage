// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { startTransition, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { clampMediaDuration, DEFAULT_MEDIA_DURATION_SECONDS } from "@/lib/media-duration";
import {
  normalizeSlideshowTransition,
  type SlideshowTransition,
} from "@/lib/slideshow-transition";
import { thumbUrl } from "@/lib/utils";
import type { MediaItem } from "@/types";

/** How many upcoming images to preload ahead of the current slide. */
const PRELOAD_AHEAD = 2;
const PRELOAD_DELAY_MS = 120;
const decodedImageCache = new Map<string, Promise<void>>();
const decodedImages = new Set<string>();

function decodeImage(src: string, fetchPriority: "high" | "low" | "auto" = "auto") {
  const cached = decodedImageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    let settled = false;

    img.decoding = "async";
    if ("fetchPriority" in img) {
      (img as HTMLImageElement & { fetchPriority: "high" | "low" | "auto" }).fetchPriority =
        fetchPriority;
    }

    const resolveDecoded = () => {
      if (settled) return;
      settled = true;
      const decode = img.decode?.();
      if (decode) {
        void decode
          .catch(() => {
            // The image is loaded, so keep the slideshow moving even if decode() is unavailable/fails.
          })
          .then(() => resolve());
        return;
      }
      resolve();
    };

    img.onload = resolveDecoded;
    img.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      resolveDecoded();
    }
  })
    .then(() => {
      decodedImages.add(src);
    })
    .catch((error) => {
      decodedImageCache.delete(src);
      throw error;
    });

  decodedImageCache.set(src, promise);
  return promise;
}

function shuffledIndexes(length: number, excludeIndex: number) {
  const indexes = Array.from({ length }, (_, index) => index).filter(
    (index) => index !== excludeIndex,
  );

  for (let index = indexes.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }

  return indexes;
}

interface MediaSliderProps {
  mediaItems: MediaItem[];
  /** How media fits the container: "contain" (show all) or "cover" (fill, may crop) */
  objectFit?: "contain" | "cover";
  playbackOrder?: "sequential" | "random";
  transition?: SlideshowTransition;
}

interface DeferredVideoSlideProps {
  item: MediaItem;
  fitClass: string;
  loop: boolean;
  onEnded: () => void;
}

interface DecodedImageSlideProps {
  item: MediaItem;
  fitClass: string;
  onReady: () => void;
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

function DecodedImageSlide({ item, fitClass, onReady }: DecodedImageSlideProps) {
  const [isReady, setIsReady] = useState(() => decodedImages.has(item.filePath));

  useEffect(() => {
    let cancelled = false;

    void decodeImage(item.filePath, "high")
      .catch((error) => {
        console.error("[MediaSlider] Failed to decode image", {
          mediaId: item.id,
          filePath: item.filePath,
          error,
        });
      })
      .then(() => {
        if (cancelled) return;
        setIsReady(true);
        onReady();
      });

    return () => {
      cancelled = true;
    };
  }, [item.filePath, item.id, onReady]);

  useEffect(() => {
    if (isReady) {
      onReady();
    }
  }, [isReady, onReady]);

  return (
    <div className="h-full w-full bg-black">
      {isReady && (
        <img
          src={item.filePath}
          alt=""
          decoding="async"
          className={`h-full w-full ${fitClass}`}
        />
      )}
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
          decoding="async"
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
  playbackOrder = "sequential",
  transition = "fade-black",
}: MediaSliderProps) {
  const { t } = useLocale();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readyImageKey, setReadyImageKey] = useState<string | null>(null);
  const videoPreloadRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const advanceTokenRef = useRef(0);
  const randomQueueRef = useRef<number[]>([]);
  const mediaItemsRef = useRef(mediaItems);
  const currentIndexRef = useRef(0);
  const playbackOrderRef = useRef(playbackOrder);
  const mediaKey = useMemo(
    () => mediaItems.map((item) => `${item.id}:${item.filePath}`).join("|"),
    [mediaItems],
  );
  const safeCurrentIndex =
    mediaItems.length === 0 ? 0 : Math.min(currentIndex, mediaItems.length - 1);

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    currentIndexRef.current = safeCurrentIndex;
  }, [safeCurrentIndex]);

  useEffect(() => {
    playbackOrderRef.current = playbackOrder;
  }, [playbackOrder]);

  useEffect(() => {
    randomQueueRef.current = [];
  }, [mediaKey, playbackOrder]);

  const ensureRandomQueue = useCallback(() => {
    const items = mediaItemsRef.current;
    const activeIndex = currentIndexRef.current;
    randomQueueRef.current = randomQueueRef.current.filter(
      (index) => index >= 0 && index < items.length && index !== activeIndex,
    );
    if (randomQueueRef.current.length === 0) {
      randomQueueRef.current = shuffledIndexes(items.length, activeIndex);
    }
    return randomQueueRef.current;
  }, []);

  const nextIndex = useCallback(() => {
    const items = mediaItemsRef.current;
    const activeIndex = currentIndexRef.current;
    if (items.length <= 1) return activeIndex;
    if (playbackOrderRef.current !== "random") {
      return (activeIndex + 1) % items.length;
    }
    return ensureRandomQueue().shift() ?? ((activeIndex + 1) % items.length);
  }, [ensureRandomQueue]);

  const advance = useCallback(() => {
    const items = mediaItemsRef.current;
    if (items.length <= 0) return;

    const upcomingIndex = nextIndex();
    const next = items[upcomingIndex];
    const token = advanceTokenRef.current + 1;
    advanceTokenRef.current = token;

    const commit = () => {
      if (advanceTokenRef.current !== token) return;
      startTransition(() => {
        setReadyImageKey(null);
        setCurrentIndex(upcomingIndex);
      });
    };

    if (next?.type === "image") {
      void decodeImage(next.filePath, "high")
        .catch((error) => {
          console.error("[MediaSlider] Failed to preload next image", {
            mediaId: next.id,
            filePath: next.filePath,
            error,
          });
        })
        .then(commit);
      return;
    }

    commit();
  }, [nextIndex]);

  // --- Preload upcoming media after the active slide has had a chance to paint. ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    const preloadIndexes =
      playbackOrder === "random"
        ? ensureRandomQueue().slice(0, PRELOAD_AHEAD)
        : Array.from(
            { length: PRELOAD_AHEAD },
            (_, offset) => (safeCurrentIndex + offset + 1) % mediaItems.length,
          );

    preloadIndexes.forEach((idx, offset) => {
      const item = mediaItems[idx];
      if (!item) return;

      const timer = setTimeout(() => {
        if (item.type === "image") {
          void decodeImage(item.filePath, offset === 1 ? "high" : "low").catch((error) => {
            console.error("[MediaSlider] Failed to preload image", {
              mediaId: item.id,
              filePath: item.filePath,
              error,
            });
          });
        } else if (item.playbackStatus === undefined || item.playbackStatus === "available") {
          if (videoPreloadRef.current.has(item.filePath)) return;
          const video = document.createElement("video");
          video.preload = "metadata";
          video.muted = true;
          video.playsInline = true;
          video.src = item.filePath;
          video.load();
          videoPreloadRef.current.set(item.filePath, video);
        }
      }, PRELOAD_DELAY_MS * (offset + 1));
      timers.push(timer);
    });

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [ensureRandomQueue, mediaItems, playbackOrder, safeCurrentIndex]);

  const current = mediaItems[safeCurrentIndex];
  const currentKey = current ? `${current.id}:${current.filePath}` : "";
  const currentType = current?.type;
  const currentDuration = current?.duration;
  const currentPlaybackMode = current?.playbackMode;
  const isCurrentImageReady =
    currentType !== "image" || readyImageKey === currentKey;

  const markCurrentImageReady = useCallback(() => {
    if (currentKey) {
      setReadyImageKey(currentKey);
    }
  }, [currentKey]);

  // --- Auto-advance timer (starts only after the current image has loaded) ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;
    if (!currentKey) return;

    // For videos the advance is handled by the video-specific effect/callback.
    if (currentType === "video") return;

    // Wait until the browser has decoded and painted the current image
    if (!isCurrentImageReady) return;

    const ms = clampMediaDuration(currentDuration ?? DEFAULT_MEDIA_DURATION_SECONDS) * 1000;
    const timer = setTimeout(advance, ms);
    return () => clearTimeout(timer);
  }, [
    mediaItems.length,
    currentKey,
    currentDuration,
    currentType,
    advance,
    isCurrentImageReady,
  ]);

  // --- Video timer mode ---
  useEffect(() => {
    if (mediaItems.length <= 1) return;

    if (currentType !== "video") return;
    if (currentPlaybackMode === "until-ended") return;

    const ms = clampMediaDuration(currentDuration ?? DEFAULT_MEDIA_DURATION_SECONDS) * 1000;
    const timer = setTimeout(advance, ms);
    return () => clearTimeout(timer);
  }, [
    mediaItems.length,
    currentDuration,
    currentPlaybackMode,
    currentType,
    advance,
  ]);

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

  const normalizedTransition = normalizeSlideshowTransition(transition);
  const fadesThroughColor =
    normalizedTransition === "fade-black" || normalizedTransition === "fade-white";
  const slide = current.type === "video" ? (
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
    <DecodedImageSlide
      item={current}
      fitClass={fitClass}
      onReady={markCurrentImageReady}
    />
  );

  return (
    <div
      className={`relative isolate h-full w-full overflow-hidden ${
        normalizedTransition === "fade-white" ? "bg-white" : "bg-black"
      }`}
    >
      {normalizedTransition === "instant" ? (
        <div key={currentKey} className="absolute inset-0">
          {slide}
        </div>
      ) : (
        <AnimatePresence mode={fadesThroughColor ? "wait" : "sync"}>
          <motion.div
            key={currentKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            {slide}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
