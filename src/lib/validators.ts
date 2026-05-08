// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

// --- Board ---

export const templateIdSchema = z.enum([
  "simple",
  "photo-clock",
  "retro",
  "message",
  "call-number",
  "clinic-hours",
  "restaurant-menu",
  "qr-info",
]);

export const boardVisibilitySchema = z.enum(["public", "private"]);

export const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  templateId: templateIdSchema,
  visibility: boardVisibilitySchema.optional().default("private"),
  config: z.record(z.unknown()).optional().default({}),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  templateId: templateIdSchema.optional(),
  visibility: boardVisibilitySchema.optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// --- MediaItem ---

export const mediaTypeSchema = z.enum(["image", "video"]);

export const createMediaItemSchema = z.object({
  boardId: z.string().uuid(),
  type: mediaTypeSchema,
  filePath: z.string().min(1),
  displayOrder: z.number().int().min(0).optional().default(0),
  duration: z.number().int().min(1).optional().default(5),
});

export const updateMediaOrderSchema = z.array(
  z.object({
    id: z.string().uuid(),
    displayOrder: z.number().int().min(0),
  })
);

// --- Message ---

export const createMessageSchema = z.object({
  boardId: z.string().uuid(),
  content: z.string().min(1).max(1000),
  priority: z.number().int().min(0).optional().default(0),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(1000).optional(),
  priority: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
