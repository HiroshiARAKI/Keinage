CREATE TABLE IF NOT EXISTS "direct_upload_sessions" (
  "media_id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "board_id" text NOT NULL,
  "object_key" text NOT NULL,
  "poster_object_key" text,
  "expires_at" text NOT NULL,
  "created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "direct_upload_sessions" ADD CONSTRAINT "direct_upload_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "direct_upload_sessions" ADD CONSTRAINT "direct_upload_sessions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_upload_sessions_owner_user_id_idx" ON "direct_upload_sessions" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_upload_sessions_board_id_idx" ON "direct_upload_sessions" USING btree ("board_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_upload_sessions_expires_at_idx" ON "direct_upload_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_oauth_flows_expires_at_idx" ON "google_oauth_flows" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_oauth_flows_consumed_at_idx" ON "google_oauth_flows" USING btree ("consumed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_requests_expires_at_idx" ON "signup_requests" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_requests_completed_at_idx" ON "signup_requests" USING btree ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_signup_requests_expires_at_idx" ON "shared_signup_requests" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_signup_requests_completed_at_idx" ON "shared_signup_requests" USING btree ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_events_created_at_idx" ON "stripe_events" USING btree ("created_at");
