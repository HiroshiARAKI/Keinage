ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_name" text;--> statement-breakpoint
ALTER TABLE "signup_requests" ADD COLUMN IF NOT EXISTS "organization_name" text;--> statement-breakpoint
ALTER TABLE "google_oauth_flows" ADD COLUMN IF NOT EXISTS "organization_name" text;