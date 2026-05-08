// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  width: number;
  height: number;
}

interface FfprobeStream {
  width?: number;
  height?: number;
  tags?: {
    rotate?: string;
  };
  side_data_list?: Array<{
    rotation?: number;
  }>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
}

function normalizeRotation(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function readRotation(stream: FfprobeStream): number {
  const tagRotation = stream.tags?.rotate ? Number(stream.tags.rotate) : NaN;
  if (Number.isFinite(tagRotation)) {
    return normalizeRotation(tagRotation);
  }

  const sideDataRotation = stream.side_data_list
    ?.map((entry) => entry.rotation)
    .find((rotation): rotation is number => typeof rotation === "number");

  return typeof sideDataRotation === "number"
    ? normalizeRotation(sideDataRotation)
    : 0;
}

function parseVideoMetadata(stdout: string): VideoMetadata {
  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const stream = parsed.streams?.[0];
  const width = stream?.width;
  const height = stream?.height;

  if (!stream || !width || !height) {
    throw new Error("Video stream metadata was not found");
  }

  const rotation = readRotation(stream);
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export async function probeVideoMetadataFromBuffer(
  buffer: Buffer,
  ext: string,
): Promise<VideoMetadata> {
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "") || ".mp4";
  const tempPath = path.join(os.tmpdir(), `keinage-video-${randomUUID()}${safeExt}`);

  await fs.writeFile(tempPath, buffer);

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:stream_tags=rotate:side_data=rotation",
      "-of",
      "json",
      tempPath,
    ], {
      maxBuffer: 1024 * 1024,
    });

    return parseVideoMetadata(stdout);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
