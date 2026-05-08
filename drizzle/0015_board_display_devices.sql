CREATE TABLE IF NOT EXISTS "board_display_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"board_id" text NOT NULL,
	"device_key" text NOT NULL,
	"user_agent" text,
	"last_seen_at" text NOT NULL,
	"created_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "board_display_devices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "board_display_devices_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_display_devices_owner_device_unique" ON "board_display_devices" USING btree ("owner_user_id","device_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_display_devices_owner_user_id_idx" ON "board_display_devices" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_display_devices_board_id_idx" ON "board_display_devices" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_display_devices_last_seen_at_idx" ON "board_display_devices" USING btree ("last_seen_at");
