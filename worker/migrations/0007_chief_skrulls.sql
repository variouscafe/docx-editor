ALTER TABLE `reports` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `idx_reports_deleted` ON `reports` (`deleted_at`);