ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "super_owner_granted_at" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_single_super_owner_unique" ON "users" USING btree ("is_super_owner") WHERE "is_super_owner" = true;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "super_owner_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "super_owner_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_owner_audit_logs_user_id_idx" ON "super_owner_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_owner_audit_logs_created_at_idx" ON "super_owner_audit_logs" USING btree ("created_at");
