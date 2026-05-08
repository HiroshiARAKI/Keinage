DROP INDEX IF EXISTS "board_display_devices_owner_device_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_display_devices_owner_device_board_unique" ON "board_display_devices" USING btree ("owner_user_id","device_key","board_id");
