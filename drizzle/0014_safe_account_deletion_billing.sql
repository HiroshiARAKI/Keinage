ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "canceled_at" text;--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "deleted_owner_at" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deleted_owner_billing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"email" text,
	"billing_mode" text DEFAULT 'disabled' NOT NULL,
	"plan_code" text DEFAULT 'free' NOT NULL,
	"billing_interval" text,
	"status" text DEFAULT 'canceled' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"canceled_at" text,
	"deleted_owner_at" text NOT NULL,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_owner_billing_records_owner_user_id_idx" ON "deleted_owner_billing_records" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_owner_billing_records_stripe_customer_id_idx" ON "deleted_owner_billing_records" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_owner_billing_records_stripe_subscription_id_idx" ON "deleted_owner_billing_records" USING btree ("stripe_subscription_id");
