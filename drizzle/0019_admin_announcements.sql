CREATE TABLE IF NOT EXISTS "admin_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"target_scope" text DEFAULT 'all' NOT NULL,
	"publish_status" text DEFAULT 'draft' NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"send_email" boolean DEFAULT false NOT NULL,
	"email_sent_at" text,
	"email_last_error" text,
	"require_acknowledgement" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"published_at" text,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "admin_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_announcements_publish_status_idx" ON "admin_announcements" USING btree ("publish_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_announcements_starts_at_idx" ON "admin_announcements" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_announcements_created_by_idx" ON "admin_announcements" USING btree ("created_by");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" text,
	"acknowledged_at" text,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "announcement_reads_announcement_id_admin_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."admin_announcements"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcement_user_unique" ON "announcement_reads" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_reads_user_id_idx" ON "announcement_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_reads_announcement_id_idx" ON "announcement_reads" USING btree ("announcement_id");
