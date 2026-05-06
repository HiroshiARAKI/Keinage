ALTER TABLE "boards" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "last_viewed_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN "pending_plan_code" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN "pending_billing_interval" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN "pending_plan_effective_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN "pending_active_board_ids" text;