ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "last_viewed_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_plan_code" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_billing_interval" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_plan_effective_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_active_board_ids" text;
