-- 신규: 리비전(버전 기록) 테이블. reports/templates 는 기존 마이그레이션(0000/0001)에 이미 존재.
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`content_md` text,
	`template_options` text NOT NULL,
	`label` text,
	`is_manual` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_revisions_report` ON `revisions` (`report_id`,`created_at`);
