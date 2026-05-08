// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import sharp from "sharp";
import path from "path";

const THUMBNAIL_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Default long-edge maximum (4K). 0 means no limit. */
export const DEFAULT_IMAGE_MAX_LONG_EDGE = 3840;

/** Thumbnail long-edge size. */
export const THUMBNAIL_LONG_EDGE = 600;

export type GeneratedThumbnail = {
  filename: string;
  buffer: Buffer;
  contentType: string;
};

/**
 * Resize an image so that its longest edge does not exceed `maxLongEdge`.
 * If the image is already within the limit, the buffer is returned as-is.
 * Returns the (possibly unchanged) buffer.
 *
 * GIF files are returned untouched to preserve animation.
 */
export async function resizeImage(
  buffer: Buffer,
  ext: string,
  maxLongEdge: number,
): Promise<Buffer> {
  if (maxLongEdge <= 0) return buffer;
  if (ext.toLowerCase() === ".gif") return buffer;

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const w = metadata.width ?? 0;
  const h = metadata.height ?? 0;
  const longEdge = Math.max(w, h);

  if (longEdge <= maxLongEdge) return buffer;

  const resized = image.resize({
    width: w >= h ? maxLongEdge : undefined,
    height: h > w ? maxLongEdge : undefined,
    fit: "inside",
    withoutEnlargement: true,
  });

  return await resized.toBuffer();
}

export async function getImageLongEdge(buffer: Buffer): Promise<number> {
  const metadata = await sharp(buffer).metadata();
  return Math.max(metadata.width ?? 0, metadata.height ?? 0);
}

export async function getImageDimensions(buffer: Buffer): Promise<{
  width: number | null;
  height: number | null;
}> {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

/**
 * Generate a thumbnail (600px long edge) buffer for later storage.
 *
 * GIF files get a static JPEG thumbnail (first frame).
 */
export async function generateThumbnail(
  buffer: Buffer,
  filename: string,
): Promise<GeneratedThumbnail> {
  const ext = path.extname(filename).toLowerCase();
  const thumbExt = ext === ".gif" ? ".jpg" : ext;
  const thumbFilename = path.basename(filename, ext) + thumbExt;

  let pipeline = sharp(buffer);

  if (ext === ".gif") {
    pipeline = pipeline.jpeg({ quality: 80 });
  }

  const thumbnailBuffer = await pipeline
    .resize({
      width: THUMBNAIL_LONG_EDGE,
      height: THUMBNAIL_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();

  return {
    filename: thumbFilename,
    buffer: thumbnailBuffer,
    contentType: THUMBNAIL_MIME_TYPES[thumbExt] ?? "image/jpeg",
  };
}
