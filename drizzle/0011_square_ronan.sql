ALTER TABLE "media_items" ADD COLUMN "file_size_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "thumbnail_size_bytes" bigint DEFAULT 0 NOT NULL;