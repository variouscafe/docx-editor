CREATE TABLE `group_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invited_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_inv_group_email` ON `group_invitations` (`group_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_inv_email` ON `group_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gm_group_user` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_gm_user` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_gm_group` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`owner_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_groups_owner` ON `groups` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`group_id` text NOT NULL,
	`shared_by` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rs_report_group` ON `report_shares` (`report_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `idx_rs_group` ON `report_shares` (`group_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text,
	`name` text,
	`picture_url` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `templates` ADD `group_id` text;--> statement-breakpoint
CREATE INDEX `idx_templates_group` ON `templates` (`group_id`);