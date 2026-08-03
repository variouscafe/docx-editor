import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// 인증은 공용 suseona-auth 가 담당(별도 Worker/D1). docx-editor-api 는 데이터 API만 담하며
// 발급된 JWT 의 sub(user_id)를 plain text 로 저장(users/refresh_sessions 테이블 없음).
// `npm run db:generate`(drizzle-kit) → ./migrations, `npm run db:apply:remote` 로 적용.

/** 보고서 — content(TipTap JSON 정규) + content_md(마크다운 미러) + template_options(스냅샷). */
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    // suseona-auth 가 발급한 user_id(JWT.sub). FK 없음(유저는 auth DB에 존재).
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    contentMd: text('content_md'),
    templateOptions: text('template_options').notNull(),
    templateId: text('template_id'),
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIdx: index('idx_reports_user').on(t.userId, t.updatedAt),
  })
);

/** 사용자 커스텀 문서 템플릿(빌트인은 FE shared/presets 사용). */
export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    name: text('name').notNull(),
    options: text('options').notNull(),
    // private=소유자만, public=사내 전체 공개(읽기/복제 가능).
    visibility: text('visibility').notNull().default('private'),
    isDefault: integer('is_default').notNull().default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIdx: index('idx_templates_user').on(t.userId),
    visibilityIdx: index('idx_templates_visibility').on(t.visibility, t.updatedAt),
  })
);

/**
 * 리비전(버전 기록) 스냅샷.
 * - 자동 리비전(is_manual=0): PATCH 저장 시 마지막 리비전으로부터 일정 간격+변경 시 생성. 최근 한도 보관.
 * - 수동 리비전(is_manual=1): "이 버전 저장" 체크포인트. 한도 없음.
 */
export const revisions = sqliteTable(
  'revisions',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    userId: text('user_id').notNull(),
    content: text('content').notNull(),
    contentMd: text('content_md'),
    templateOptions: text('template_options').notNull(),
    label: text('label'),
    isManual: integer('is_manual').notNull().default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    reportIdx: index('idx_revisions_report').on(t.reportId, t.createdAt),
  })
);
