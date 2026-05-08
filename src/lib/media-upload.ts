// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import path from "path";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;
export const ALLOWED_VIDEO_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const CONTENT_TYPE_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
};

export function mediaTypeFromContentType(contentType: string): "image" | "video" | null {
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) return "image";
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType)) return "video";
  return null;
}

export function validateUploadFilename(input: {
  fileName: string;
  contentType: string;
}): { ok: true; extension: string } | { ok: false; error: string } {
  const allowedExtensions = CONTENT_TYPE_EXTENSIONS[input.contentType];
  if (!allowedExtensions) {
    return { ok: false, error: "Unsupported file type" };
  }

  const extension = path.extname(input.fileName).toLowerCase();
  if (!extension) {
    return { ok: false, error: "File extension is required" };
  }

  if (!allowedExtensions.includes(extension)) {
    return { ok: false, error: "File extension does not match content type" };
  }

  return {
    ok: true,
    extension: extension === ".jpeg" ? ".jpg" : extension,
  };
}

export function uploadExtensionFromFilename(fileName: string, contentType: string): string {
  const validation = validateUploadFilename({ fileName, contentType });
  if (validation.ok) {
    return validation.extension;
  }

  const extension = path.extname(fileName) || CONTENT_TYPE_EXTENSIONS[contentType]?.[0] || "";
  const sanitized = extension.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  return sanitized || CONTENT_TYPE_EXTENSIONS[contentType]?.[0] || "";
}

export function extensionForContentType(contentType: string): string {
  return CONTENT_TYPE_EXTENSIONS[contentType]?.[0] ?? "";
}
