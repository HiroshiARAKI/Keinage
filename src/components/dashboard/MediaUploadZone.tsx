// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Upload, X, GripVertical, Trash2, Image as ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/components/i18n/LocaleProvider";
import {
  ScheduleControls,
  sanitizeScheduleMap,
} from "@/components/dashboard/BoardSchedulePanel";
import { planLimitMessageKey } from "@/lib/plan-limit";
import { MAX_MEDIA_DURATION_SECONDS, type MediaPlaybackMode } from "@/lib/media-duration";
import type { BoardMediaLimitUsage } from "@/lib/board-media-plan";
import {
  getScheduleMap,
  normalizeDisplaySchedule,
  type DisplaySchedule,
  type ScheduleCapability,
} from "@/lib/scheduling";
import { thumbUrl } from "@/lib/utils";
import type { MediaItem } from "@/types";

interface MediaUploadZoneProps {
  boardId: string;
  mediaItems: MediaItem[];
  onUpdate: () => Promise<void>;
  showPlaybackControls?: boolean;
  mediaUsage?: BoardMediaLimitUsage;
  scheduleConfig?: Record<string, unknown>;
  scheduling?: ScheduleCapability;
  onScheduleConfigChange?: (config: Record<string, unknown>) => void;
}

interface UploadProgress {
  name: string;
  progress: number;
}

type JsonRecord = Record<string, unknown>;

type VideoUploadAssets = {
  poster: File | null;
  width: number | null;
  height: number | null;
};

type DirectUploadInitResponse = {
  mediaId: string;
  objectKey: string;
  uploadUrl: string;
  posterUpload?: {
    objectKey: string;
    uploadUrl: string;
  } | null;
};

const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const VIDEO_POSTER_MIME_TYPE = "image/jpeg";
const VIDEO_POSTER_EXTENSION = ".jpg";

function waitForVideoEvent(video: HTMLVideoElement, eventName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out while waiting for ${eventName}`));
    }, 8000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener("error", handleError);
    };

    const handleEvent = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Could not load video for poster generation"));
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, VIDEO_POSTER_MIME_TYPE, 0.82);
  });
}

async function createVideoUploadAssets(file: File): Promise<VideoUploadAssets | null> {
  if (!VIDEO_TYPES.has(file.type)) return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.src = objectUrl;

  try {
    video.load();
    await waitForVideoEvent(video, "loadedmetadata");

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTarget = duration > 0.3 ? Math.min(0.25, duration / 3) : 0;
    if (seekTarget > 0) {
      video.currentTime = seekTarget;
      await waitForVideoEvent(video, "seeked");
    } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) {
      return { poster: null, width: null, height: null };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { poster: null, width, height };
    context.drawImage(video, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);
    if (!blob) return { poster: null, width, height };

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return {
      poster: new File([blob], `${baseName}${VIDEO_POSTER_EXTENSION}`, {
        type: VIDEO_POSTER_MIME_TYPE,
      }),
      width,
      height,
    };
  } catch (error) {
    console.error("[MediaUploadZone] Failed to generate video poster", {
      filename: file.name,
      error,
    });
    return { poster: null, width: null, height: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {};
  } catch {
    return { error: text.slice(0, 500) };
  }
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`S3 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("S3 upload failed"));
    xhr.send(file);
  });
}

function isDirectUploadCandidate(file: File): boolean {
  return VIDEO_TYPES.has(file.type);
}

export default function MediaUploadZone({
  boardId,
  mediaItems,
  onUpdate,
  showPlaybackControls = true,
  mediaUsage,
  scheduleConfig,
  scheduling = "none",
  onScheduleConfigChange,
}: MediaUploadZoneProps) {
  const { t } = useLocale();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState<UploadProgress[]>([]);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMedia =
    !mediaUsage?.applies
    || mediaUsage.media.limit === null
    || mediaUsage.media.used < mediaUsage.media.limit;
  const canAddVideo =
    !mediaUsage?.applies
    || mediaUsage.videos.limit === null
    || mediaUsage.videos.used < mediaUsage.videos.limit;
  const ACCEPTED_TYPES = canAddVideo
    ? "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
    : "image/jpeg,image/png,image/webp,image/gif";

  useEffect(() => {
    if (!uploadNotice) return;
    const timeout = window.setTimeout(() => setUploadNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [uploadNotice]);

  const showUploadError = useCallback(
    (data: JsonRecord) => {
      const messageKey = planLimitMessageKey(
        typeof data.code === "string" ? data.code : undefined,
        typeof data.messageKey === "string" ? data.messageKey : undefined,
      );
      setUploadNotice(
        messageKey
          ? t(messageKey)
          : typeof data.error === "string"
            ? data.error
            : t("error.network"),
      );
    },
    [t],
  );

  const completeServerUpload = useCallback(
    async (file: File, poster: File | null, index: number) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("boardId", boardId);
      if (poster) {
        formData.append("poster", poster);
      }

      const res = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        showUploadError(data);
        console.error(`Upload failed for ${file.name}:`, data.error);
        return;
      }

      setUploading((prev) =>
        prev.map((p, idx) =>
          idx === index ? { ...p, progress: 100 } : p,
        ),
      );
    },
    [boardId, showUploadError],
  );

  const completeDirectUpload = useCallback(
    async (
      file: File,
      assets: VideoUploadAssets | null,
      index: number,
    ): Promise<boolean> => {
      if (!isDirectUploadCandidate(file)) return false;

      const initRes = await fetch("/api/media/direct/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          width: assets?.width ?? null,
          height: assets?.height ?? null,
          poster: assets?.poster
            ? {
                contentType: assets.poster.type,
                sizeBytes: assets.poster.size,
              }
            : undefined,
        }),
      });
      const initData = await parseJsonResponse(initRes);

      if (
        initRes.status === 409
        && initData.code === "direct_upload_unavailable"
      ) {
        return false;
      }

      if (!initRes.ok) {
        showUploadError(initData);
        return true;
      }

      const direct = initData as JsonRecord & DirectUploadInitResponse;
      await uploadWithProgress(direct.uploadUrl, file, (progress) => {
        setUploading((prev) =>
          prev.map((p, idx) =>
            idx === index
              ? { ...p, progress: Math.min(90, Math.max(1, Math.round(progress * 0.9))) }
              : p,
          ),
        );
      });

      if (assets?.poster && direct.posterUpload) {
        await uploadWithProgress(direct.posterUpload.uploadUrl, assets.poster, (progress) => {
          setUploading((prev) =>
            prev.map((p, idx) =>
              idx === index
                ? { ...p, progress: 90 + Math.min(5, Math.round(progress * 0.05)) }
                : p,
            ),
          );
        });
      }

      const completeRes = await fetch("/api/media/direct/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          mediaId: direct.mediaId,
          fileName: file.name,
          objectKey: direct.objectKey,
          contentType: file.type,
          sizeBytes: file.size,
          width: assets?.width ?? null,
          height: assets?.height ?? null,
          poster: assets?.poster && direct.posterUpload
            ? {
                objectKey: direct.posterUpload.objectKey,
                contentType: assets.poster.type,
                sizeBytes: assets.poster.size,
              }
            : undefined,
        }),
      });
      const completeData = await parseJsonResponse(completeRes);

      if (!completeRes.ok) {
        showUploadError(completeData);
        return true;
      }

      setUploading((prev) =>
        prev.map((p, idx) =>
          idx === index ? { ...p, progress: 100 } : p,
        ),
      );
      return true;
    },
    [boardId, showUploadError],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!canAddMedia) {
        setUploadNotice(t("planLimit.boardMediaCount"));
        return;
      }

      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setUploading(fileArray.map((f) => ({ name: f.name, progress: 0 })));

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const assets = await createVideoUploadAssets(file);

        try {
          const handledDirectly = await completeDirectUpload(file, assets, i);
          if (!handledDirectly) {
            await completeServerUpload(file, assets?.poster ?? null, i);
          }
        } catch (err) {
          setUploadNotice(err instanceof Error ? err.message : t("error.network"));
          console.error(`Upload error for ${file.name}:`, err);
        }
      }

      await onUpdate();
      setUploading([]);
    },
    [canAddMedia, completeDirectUpload, completeServerUpload, onUpdate, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (res.ok) {
        await onUpdate();
      }
    },
    [onUpdate],
  );

  const handleDurationChange = useCallback(
    async (id: string, duration: number) => {
      await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration }),
      });
      await onUpdate();
    },
    [onUpdate],
  );

  const handlePlaybackModeChange = useCallback(
    async (id: string, playbackMode: MediaPlaybackMode) => {
      await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbackMode }),
      });
      await onUpdate();
    },
    [onUpdate],
  );

  // Drag & drop reorder handlers
  const handleReorderDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const handleReorderDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverIndex(index);
    },
    [],
  );

  const handleReorderDrop = useCallback(
    async (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);

      if (draggedIndex === null || draggedIndex === dropIndex) {
        setDraggedIndex(null);
        return;
      }

      const sorted = [...mediaItems].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      const [moved] = sorted.splice(draggedIndex, 1);
      sorted.splice(dropIndex, 0, moved);

      const orderUpdates = sorted.map((item, idx) => ({
        id: item.id,
        displayOrder: idx,
      }));

      setDraggedIndex(null);

      await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderUpdates),
      });
      await onUpdate();
    },
    [draggedIndex, mediaItems, onUpdate],
  );

  const handleReorderDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const sortedMedia = [...mediaItems].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const mediaSchedules = getScheduleMap(scheduleConfig?.mediaSchedules);
  const canEditSchedules = Boolean(
    scheduleConfig && onScheduleConfigChange && scheduling !== "none",
  );

  function updateMediaSchedule(id: string, schedule: DisplaySchedule) {
    if (!scheduleConfig || !onScheduleConfigChange) return;

    const nextMap = sanitizeScheduleMap({
      ...getScheduleMap(scheduleConfig.mediaSchedules),
      [id]: schedule,
    });

    onScheduleConfigChange({
      ...scheduleConfig,
      mediaSchedules: nextMap,
    });
  }

  function mediaNumberLabel(item: MediaItem, index: number) {
    if (item.type === "image") {
      const number =
        sortedMedia.slice(0, index + 1).filter((media) => media.type === "image").length;
      return t("schedule.imageNumber", { number });
    }

    const number =
      sortedMedia.slice(0, index + 1).filter((media) => media.type === "video").length;
    return t("schedule.videoNumber", { number });
  }

  return (
    <div className="space-y-4">
      {uploadNotice && (
        <div className="fixed right-4 top-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm text-foreground shadow-lg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">{uploadNotice}</div>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.cancel")}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={canAddMedia ? handleDrop : undefined}
        onDragOver={canAddMedia ? handleDragOver : undefined}
        onDragLeave={canAddMedia ? handleDragLeave : undefined}
        onClick={() => {
          if (canAddMedia) fileInputRef.current?.click();
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          canAddMedia ? "cursor-pointer" : "cursor-not-allowed opacity-60"
        } ${
          canAddMedia && isDragOver
            ? "border-primary bg-primary/5"
            : canAddMedia
              ? "border-muted-foreground/25 hover:border-primary/50"
              : "border-muted-foreground/20"
        }`}
      >
        <Upload className="mb-2 size-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {t("media.uploadPrompt")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("media.acceptedTypesHint")}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={!canAddMedia}
        />
      </div>

      {mediaUsage?.applies && (
        <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          <MediaUsageLine
            label={t("media.boardMediaUsage")}
            used={mediaUsage.media.used}
            limit={mediaUsage.media.limit}
            unlimitedLabel={t("media.unlimited")}
            overLimit={mediaUsage.media.overLimit || mediaUsage.media.atLimit}
          />
          <MediaUsageLine
            label={t("media.boardVideoUsage")}
            used={mediaUsage.videos.used}
            limit={mediaUsage.videos.limit}
            unlimitedLabel={t("media.unlimited")}
            overLimit={mediaUsage.videos.overLimit || mediaUsage.videos.atLimit}
          />
          <div className={mediaUsage.videoDuration.overLimit ? "text-destructive" : ""}>
            <span className="font-medium text-foreground">{t("media.boardVideoDurationLimit")}</span>
            <span className="ml-1">
              {mediaUsage.videoDuration.limitSeconds === null
                ? t("media.unlimited")
                : formatMediaDuration(mediaUsage.videoDuration.limitSeconds)}
            </span>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center"
            >
              <span className="flex-1 truncate">{item.name}</span>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:w-24">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media list with thumbnails & reorder */}
      {sortedMedia.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("settings.mediaEmpty")}
        </p>
      ) : (
        <div className="space-y-2">
          {sortedMedia.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleReorderDragStart(e, index)}
              onDragOver={(e) => handleReorderDragOver(e, index)}
              onDrop={(e) => handleReorderDrop(e, index)}
              onDragEnd={handleReorderDragEnd}
              className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                draggedIndex === index ? "opacity-50" : ""
              } ${dragOverIndex === index ? "border-primary bg-primary/5" : ""}`}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />

              {/* Thumbnail */}
              <div className="relative size-12 shrink-0 overflow-hidden rounded border bg-muted">
                {item.type === "image" ? (
                  <img
                    src={thumbUrl(item.filePath)}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => {
                      // Fall back to full image if thumbnail not found
                      (e.target as HTMLImageElement).src = item.filePath;
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <img
                      src={thumbUrl(item.filePath)}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                      onError={(e) => {
                        (e.currentTarget.style.display = "none");
                      }}
                    />
                    <Film className="size-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 basis-40">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {item.type === "image" ? (
                      <ImageIcon className="mr-1 size-3" />
                    ) : (
                      <Film className="mr-1 size-3" />
                    )}
                    {mediaNumberLabel(item, index)}
                  </Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {item.filePath.split("/").pop()}
                  </span>
                </div>
              </div>

              {/* Duration */}
              {showPlaybackControls && (
                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Label className="text-xs text-muted-foreground">{t("media.durationSeconds")}</Label>
                  <NumberInput
                    min={1}
                    max={MAX_MEDIA_DURATION_SECONDS}
                    value={item.duration}
                    onValueChange={(value) => handleDurationChange(item.id, value)}
                    className="h-7 w-16 text-xs"
                  />
                  {item.type === "video" && (
                    <Select
                      value={item.playbackMode ?? "duration"}
                      onValueChange={(value) =>
                        handlePlaybackModeChange(item.id, value as MediaPlaybackMode)}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue>
                          {(item.playbackMode ?? "duration") === "until-ended"
                            ? t("configEditor.videoAdvance.untilEnded")
                            : t("configEditor.videoAdvance.duration")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="duration">{t("configEditor.videoAdvance.duration")}</SelectItem>
                        <SelectItem value="until-ended">{t("configEditor.videoAdvance.untilEnded")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto sm:ml-0"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>

              {canEditSchedules && (
                <div className="basis-full border-t pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("schedule.mediaSchedule")}
                    </Label>
                  </div>
                  <ScheduleControls
                    idPrefix={`media-${item.id}`}
                    schedule={normalizeDisplaySchedule(mediaSchedules[item.id])}
                    capability={scheduling}
                    allowHidden
                    onChange={(nextSchedule) =>
                      updateMediaSchedule(item.id, nextSchedule)
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaUsageLine({
  label,
  used,
  limit,
  unlimitedLabel,
  overLimit,
}: {
  label: string;
  used: number;
  limit: number | null;
  unlimitedLabel: string;
  overLimit: boolean;
}) {
  return (
    <div className={overLimit ? "text-destructive" : ""}>
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-1">
        {used} / {limit === null ? unlimitedLabel : limit}
      </span>
    </div>
  );
}

function formatMediaDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0
    ? `${minutes}m`
    : `${minutes}m ${remainingSeconds}s`;
}
