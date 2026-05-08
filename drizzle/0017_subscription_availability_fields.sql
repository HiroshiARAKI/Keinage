ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_schedule_id" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "current_price_id" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "ended_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_price_id" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "last_synced_at" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_subscriptions_stripe_schedule_id_idx" ON "owner_subscriptions" USING btree ("stripe_schedule_id");
