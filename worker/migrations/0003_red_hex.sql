ALTER TABLE `templates` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_templates_visibility` ON `templates` (`visibility`,`updated_at`);