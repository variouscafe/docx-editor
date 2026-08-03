-- 공용 suseona-auth 로 인증 위임: users/refresh_sessions 제거 + reports/templates 의 user_id FK 제거(plain text).
-- docs D1 은 신규(데이터 없음)이므로 drop/recreate 안전.
DROP TABLE IF EXISTS `templates`;
--> statement-breakpoint
DROP TABLE IF EXISTS `reports`;
--> statement-breakpoint
DROP TABLE IF EXISTS `refresh_sessions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `users`;
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_md` text,
	`template_options` text NOT NULL,
	`template_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reports_user` ON `reports` (`user_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`options` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_templates_user` ON `templates` (`user_id`);
