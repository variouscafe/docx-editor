CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`r2_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_user` ON `uploads` (`user_id`,`created_at`);