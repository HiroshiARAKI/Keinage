ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_signup_requests" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'invited' NOT NULL;
