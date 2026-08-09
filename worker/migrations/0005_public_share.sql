ALTER TABLE `reports` ADD `share_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reports_share_token` ON `reports` (`share_token`);