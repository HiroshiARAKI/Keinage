ALTER TABLE "media_items" ADD COLUMN IF NOT EXISTS "playback_mode" text DEFAULT 'duration' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ALTER COLUMN "duration" SET DEFAULT 10;
