import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    // private=소유자만, public=사내 전체 공개, group=지정 그룹원 공개(groupId 필수).
    visibility: text('visibility').notNull().default('private'),
    // visibility='group' 일 때의 대상 그룹. 그 외는 null.
    groupId: text('group_id'),
    isDefault: integer('is_default').notNull().default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIdx: index('idx_templates_user').on(t.userId),
    visibilityIdx: index('idx_templates_visibility').on(t.visibility, t.updatedAt),
    groupIdx: index('idx_templates_group').on(t.groupId),
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

/**
 * 사용자 식별 캐시 — 인증(구글/JWT 발급)은 공용 suseona-auth 가 담당하므로 본 D1엔
 * users 테이블이 없다. 그룹 멤버 이름/이메일 표시를 위해 jwtAuth 에서 upsert 하는 표시용 캐시.
 */
export const users = sqliteTable(
  'users',
  {
    userId: text('user_id').primaryKey(),
    email: text('email'),
    name: text('name'),
    pictureUrl: text('picture_url'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    emailIdx: index('idx_users_email').on(t.email),
  }),
);

/** 그룹(사내 팀 단위 공유 단위). 생성자가 owner. */
export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: text('owner_user_id').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    ownerIdx: index('idx_groups_owner').on(t.ownerUserId),
  }),
);

/** 그룹 멤버. role: owner(생성자)|admin(멤버 관리 위임)|member. */
export const groupMembers = sqliteTable(
  'group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('member'),
    joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    groupUserUniq: uniqueIndex('uq_gm_group_user').on(t.groupId, t.userId),
    userIdx: index('idx_gm_user').on(t.userId),
    groupIdx: index('idx_gm_group').on(t.groupId),
  }),
);

/** 그룹 초대(이메일 기반). 미가입자는 pending → 로그인 시 자동 수락(sweep). */
export const groupInvitations = sqliteTable(
  'group_invitations',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    invitedBy: text('invited_by').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    acceptedAt: text('accepted_at'),
  },
  (t) => ({
    groupEmailUniq: uniqueIndex('uq_inv_group_email').on(t.groupId, t.email),
    emailStatusIdx: index('idx_inv_email').on(t.email, t.status),
  }),
);

/** 보고서 공유(그룹 단위, 읽기 전용). permission 은 현재 'view' 고정 — 확장 대비 컬럼 유지. */
export const reportShares = sqliteTable(
  'report_shares',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    groupId: text('group_id').notNull(),
    sharedBy: text('shared_by').notNull(),
    permission: text('permission').notNull().default('view'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    reportGroupUniq: uniqueIndex('uq_rs_report_group').on(t.reportId, t.groupId),
    groupIdx: index('idx_rs_group').on(t.groupId),
  }),
);
