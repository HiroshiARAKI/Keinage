CREATE TABLE "owner_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"billing_mode" text DEFAULT 'disabled' NOT NULL,
	"plan_code" text DEFAULT 'free' NOT NULL,
	"billing_interval" text,
	"status" text DEFAULT 'none' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_subscriptions_owner_user_id_unique" ON "owner_subscriptions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "owner_subscriptions_stripe_customer_id_idx" ON "owner_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "owner_subscriptions_stripe_subscription_id_idx" ON "owner_subscriptions" USING btree ("stripe_subscription_id");