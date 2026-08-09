import { Hono } from 'hono';
import { and, desc, eq, inArray, like, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { AppEnv } from '../types.js';
import { createDb } from '../db/index.js';
import { reports, revisions, reportShares, users, groups } from '../db/schema.js';
import { newId, isoNow, newShareToken } from '../lib/id.js';
import { badRequest, forbidden, notFound, conflict } from '../lib/errors.js';
import { jwtAuth } from '../middleware/auth.js';
import { ensureReportAccess, assertGroupMember, getGroupIds } from '../lib/authz.js';
import type {
  Report,
  ReportListItem,
  ReportPermission,
  ReportStatus,
  Revision,
  RevisionListItem,
  PublicShareState,
} from '@shared/report';
import type { ReportShare } from '@shared/groups';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const reportCreateSchema = z.object({
  title: z.string().min(1),
  // ProseMirror JSON — BE 는 해석하지 않고 저장(DOCX 생성기만 소비).
  content: z.any(),
  contentMd: z.string().optional(),
  templateOptions: z.any(),
  templateId: z.string().nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
});
const reportPatchSchema = reportCreateSchema.partial();

export const reportRoutes = new Hono<AppEnv>();
reportRoutes.use('*', jwtAuth);

/** DB 행(문자열 JSON 포함) → Report(파싱된 객체). permission 은 호출부에서 계산(기본 owner). */
function serializeReport(
  row: typeof reports.$inferSelect,
  permission: ReportPermission = 'owner',
): Report {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    content: JSON.parse(row.content),
    contentMd: row.contentMd,
    templateOptions: JSON.parse(row.templateOptions),
    templateId: row.templateId,
    status: row.status as ReportStatus,
    permission,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ── 리비전 헬퍼 ────────────────────────────────────────────────── */
const REVISION_AUTO_INTERVAL_MS = 3 * 60 * 1000; // 자동 리비전 최소 간격
const REVISION_AUTO_LIMIT = 30; // 자동 리비전 보존 한도

function serializeRevision(row: typeof revisions.$inferSelect): Revision {
  return {
    id: row.id,
    reportId: row.reportId,
    content: JSON.parse(row.content),
    contentMd: row.contentMd,
    templateOptions: JSON.parse(row.templateOptions),
    label: row.label,
    isManual: row.isManual === 1,
    createdAt: row.createdAt,
  };
}

/** SQLite CURRENT_TIMESTAMP("YYYY-MM-DD HH:MM:SS" UTC) → epoch ms. */
function parseTs(s: string): number {
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

/**
 * 자동 리비전 생성(content 변경 + 마지막 자동 리비전으로부터 간격 경과 시).
 * 한도 초과 시 오래된 자동 리비전부터 정리. PATCH(저장) 에서 호출.
 */
async function maybeCreateAutoRevision(
  db: ReturnType<typeof createDb>,
  reportId: string,
  userId: string,
  existingContent: string,
  newContent: unknown,
  newContentMd: string | null,
  newTemplateOptions: unknown,
) {
  // content 변경 없으면 리비전 미생성
  if (existingContent === JSON.stringify(newContent)) return;

  const last = await db
    .select({ createdAt: revisions.createdAt })
    .from(revisions)
    .where(and(eq(revisions.reportId, reportId), eq(revisions.isManual, 0)))
    .orderBy(desc(revisions.createdAt))
    .limit(1)
    .get();
  const elapsed = last ? Date.now() - parseTs(last.createdAt) : Infinity;
  if (elapsed < REVISION_AUTO_INTERVAL_MS) return;

  await db.insert(revisions).values({
    id: newId(),
    reportId,
    userId,
    content: JSON.stringify(newContent),
    contentMd: newContentMd,
    templateOptions: JSON.stringify(newTemplateOptions),
    isManual: 0,
  });

  // 한도 초과 자동 리비전 정리(오래된 것부터)
  const autos = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.reportId, reportId), eq(revisions.isManual, 0)))
    .orderBy(desc(revisions.createdAt))
    .all();
  for (const old of autos.slice(REVISION_AUTO_LIMIT)) {
    await db.delete(revisions).where(eq(revisions.id, old.id));
  }
}

/** 보고서 소유권 확인(쓰기 전용). 공유받은 사용자는 403. */
async function ensureOwned(
  db: ReturnType<typeof createDb>,
  id: string,
  userId: string,
) {
  const { row, isOwner } = await ensureReportAccess(db, id, userId);
  if (!isOwner) throw forbidden('Report is read-only');
  return row;
}

/** 보고서 목록 (최신순) — 내 보고서 + 공유받은 보고서. ?q= 제목 검색, ?status= 상태 필터. */
reportRoutes.get('/', async (c) => {
  const userId = c.get('user').userId;
  const q = c.req.query('q')?.trim();
  const status = c.req.query('status');
  const db = createDb(c.env.DB);

  // 공유받은 보고서 id (내 그룹에 공유된 것)
  const myGroups = await getGroupIds(db, userId);
  const sharedIds = myGroups.length
    ? (
        await db
          .select({ id: reportShares.reportId })
          .from(reportShares)
          .where(inArray(reportShares.groupId, myGroups))
          .all()
      ).map((r) => r.id)
    : [];

  const ownerCond = eq(reports.userId, userId);
  const scope: SQL = sharedIds.length
    ? or(ownerCond, inArray(reports.id, sharedIds))!
    : ownerCond;
  const conditions: SQL[] = [scope];
  if (q) conditions.push(like(reports.title, `%${q}%`));
  if (status === 'draft' || status === 'published') conditions.push(eq(reports.status, status));

  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      ownerId: reports.userId,
      ownerName: users.name,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(users, eq(reports.userId, users.userId))
    .where(and(...conditions))
    .orderBy(desc(reports.updatedAt))
    .all();

  // 공유 보고서의 그룹명(표시용, 첫 그룹)
  const groupOfReport = new Map<string, string>();
  if (sharedIds.length) {
    const grs = await db
      .select({ reportId: reportShares.reportId, name: groups.name })
      .from(reportShares)
      .leftJoin(groups, eq(reportShares.groupId, groups.id))
      .where(and(inArray(reportShares.reportId, sharedIds), inArray(reportShares.groupId, myGroups)))
      .all();
    for (const g of grs) if (!groupOfReport.has(g.reportId)) groupOfReport.set(g.reportId, g.name ?? '');
  }

  const items: ReportListItem[] = rows.map((r) => {
    const isOwner = r.ownerId === userId;
    return {
      id: r.id,
      title: r.title,
      status: r.status as ReportStatus,
      permission: isOwner ? 'owner' : 'view',
      ownerName: isOwner ? null : (r.ownerName ?? null),
      groupName: isOwner ? null : (groupOfReport.get(r.id) ?? null),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
  return c.json({ items });
});

/** 생성. */
reportRoutes.post('/', async (c) => {
  const userId = c.get('user').userId;
  const parsed = reportCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { title, content, contentMd, templateOptions, templateId, status } = parsed.data;

  const id = newId();
  const db = createDb(c.env.DB);
  await db.insert(reports).values({
    id,
    userId,
    title,
    content: JSON.stringify(content),
    contentMd: contentMd ?? null,
    templateOptions: JSON.stringify(templateOptions),
    templateId: templateId ?? null,
    status: status ?? 'draft',
  });

  const row = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.userId, userId))).get();
  if (!row) throw notFound('Report not found');
  return c.json(serializeReport(row), 201);
});

/** 단건 조회. owner 또는 공유받은 그룹원. 응답에 permission 포함. */
reportRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const { row, isOwner } = await ensureReportAccess(db, c.req.param('id'), user.userId);
  const body = serializeReport(row, isOwner ? 'owner' : 'view');
  if (!isOwner) {
    const owner = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.userId, row.userId))
      .get();
    body.ownerName = owner?.name ?? null;
    const myGroups = await getGroupIds(db, user.userId);
    if (myGroups.length) {
      const share = await db
        .select({ groupId: reportShares.groupId })
        .from(reportShares)
        .where(and(eq(reportShares.reportId, row.id), inArray(reportShares.groupId, myGroups)))
        .limit(1)
        .get();
      if (share) {
        const g = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, share.groupId)).get();
        body.groupName = g?.name ?? null;
      }
    }
  }
  return c.json(body);
});

/** 수정 (자동/수동 저장). */
reportRoutes.patch('/:id', async (c) => {
  const userId = c.get('user').userId;
  const parsed = reportPatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { title, content, contentMd, templateOptions, templateId, status } = parsed.data;

  const db = createDb(c.env.DB);
  const { row: existing, isOwner } = await ensureReportAccess(db, c.req.param('id'), userId);
  if (!isOwner) throw forbidden('Report is read-only');

  // 자동 리비전(content 변경 + 간격 경과 시) — update 전 기존 content 와 비교.
  if (content !== undefined) {
    await maybeCreateAutoRevision(
      db,
      existing.id,
      userId,
      existing.content,
      content,
      contentMd ?? existing.contentMd,
      templateOptions !== undefined ? templateOptions : JSON.parse(existing.templateOptions),
    );
  }

  const patch: Record<string, unknown> = { updatedAt: isoNow() };
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = JSON.stringify(content);
  if (contentMd !== undefined) patch.contentMd = contentMd;
  if (templateOptions !== undefined) patch.templateOptions = JSON.stringify(templateOptions);
  if (templateId !== undefined) patch.templateId = templateId;
  if (status !== undefined) patch.status = status;

  await db.update(reports).set(patch).where(eq(reports.id, existing.id));

  const row = await db.select().from(reports).where(eq(reports.id, existing.id)).get();
  if (!row) throw notFound('Report not found');
  return c.json(serializeReport(row));
});

/** 삭제(owner). 공유·리비전도 함께 정리(FK 없음). */
reportRoutes.delete('/:id', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const { row, isOwner } = await ensureReportAccess(db, c.req.param('id'), userId);
  if (!isOwner) throw forbidden('Report is read-only');
  await db.delete(reportShares).where(eq(reportShares.reportId, row.id));
  await db.delete(revisions).where(eq(revisions.reportId, row.id));
  await db.delete(reports).where(eq(reports.id, row.id));
  return c.body(null, 204);
});

/**
 * DOCX 내보내기 — 저장된 content(JSON) + templateOptions(스냅샷) 로 BE 에서 생성.
 * DOM-free. docx 패키지는 이 핸들러에서만 lazy import(다른 라우트 콜드스타트 회피).
 */
reportRoutes.post('/:id/export', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const { row } = await ensureReportAccess(db, c.req.param('id'), userId);

  const { generateDocx } = await import('../docx/generator.js');
  const buf = await generateDocx(JSON.parse(row.content), JSON.parse(row.templateOptions));

  const safeName = (row.title || 'document').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  return new Response(buf, {
    headers: {
      'content-type': DOCX_CONTENT_TYPE,
      'content-disposition': `attachment; filename="${encodeURIComponent(safeName)}.docx"`,
    },
  });
});

/* ── 퍼블릭 링크 공유(로그인 없이 읽기 전용) ───────────────────── */

const publicSharePatchSchema = z.object({
  enabled: z.boolean().optional(),
  regenerate: z.boolean().optional(),
});

/** 퍼블릭 공유 상태 조회(owner). { enabled, token }. */
reportRoutes.get('/:id/public-share', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const row = await ensureOwned(db, c.req.param('id'), userId);
  return c.json({ enabled: row.shareEnabled, token: row.shareToken } satisfies PublicShareState);
});

/**
 * 퍼블릭 공유 토글·토큰 재생성(owner).
 * - enabled=true: 활성화(토큰 없으면 발급)
 * - enabled=false: 비활성화(토큰은 유지 → 재활성 시 동일 링크)
 * - regenerate=true: 새 토큰 발급(활성 상태는 유지, 이전 링크 즉시 무효)
 */
reportRoutes.put('/:id/public-share', async (c) => {
  const userId = c.get('user').userId;
  const parsed = publicSharePatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { enabled, regenerate } = parsed.data;

  const db = createDb(c.env.DB);
  const row = await ensureOwned(db, c.req.param('id'), userId);

  let nextEnabled = row.shareEnabled;
  let nextToken = row.shareToken;
  if (enabled === true) nextEnabled = true;
  if (enabled === false) nextEnabled = false;
  if (regenerate) nextToken = newShareToken();
  if (nextEnabled && !nextToken) nextToken = newShareToken();

  const patch: Record<string, unknown> = { updatedAt: isoNow() };
  if (nextEnabled !== row.shareEnabled) patch.shareEnabled = nextEnabled;
  if (nextToken !== row.shareToken) patch.shareToken = nextToken;
  if (Object.keys(patch).length > 1) {
    await db.update(reports).set(patch).where(eq(reports.id, row.id));
  }

  return c.json({ enabled: nextEnabled, token: nextToken } satisfies PublicShareState);
});

/* ── 공유(그룹 단위, 읽기 전용) ─────────────────────────────────── */

const shareCreateSchema = z.object({ groupId: z.string().min(1) });

/** 공유 목록(owner). */
reportRoutes.get('/:id/shares', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const row = await ensureOwned(db, c.req.param('id'), user.userId);
  const rows = await db
    .select({
      id: reportShares.id,
      reportId: reportShares.reportId,
      groupId: reportShares.groupId,
      sharedBy: reportShares.sharedBy,
      permission: reportShares.permission,
      createdAt: reportShares.createdAt,
      groupName: groups.name,
    })
    .from(reportShares)
    .leftJoin(groups, eq(reportShares.groupId, groups.id))
    .where(eq(reportShares.reportId, row.id))
    .orderBy(desc(reportShares.createdAt))
    .all();
  const items: ReportShare[] = rows.map((r) => ({
    id: r.id,
    reportId: r.reportId,
    groupId: r.groupId,
    groupName: r.groupName ?? '',
    sharedBy: r.sharedBy,
    permission: r.permission as 'view',
    createdAt: r.createdAt,
  }));
  return c.json({ items });
});

/** 공유 추가(owner). 소유자가 속한 그룹에만 공유 가능. */
reportRoutes.post('/:id/shares', async (c) => {
  const user = c.get('user');
  const parsed = shareCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const db = createDb(c.env.DB);
  const row = await ensureOwned(db, c.req.param('id'), user.userId);
  const { groupId } = parsed.data;
  await assertGroupMember(db, groupId, user.userId);
  const dup = await db
    .select({ id: reportShares.id })
    .from(reportShares)
    .where(and(eq(reportShares.reportId, row.id), eq(reportShares.groupId, groupId)))
    .get();
  if (dup) throw conflict('Already shared to this group');
  const id = newId();
  await db.insert(reportShares).values({
    id,
    reportId: row.id,
    groupId,
    sharedBy: user.userId,
    permission: 'view',
  });
  const created = await db
    .select({
      id: reportShares.id,
      reportId: reportShares.reportId,
      groupId: reportShares.groupId,
      sharedBy: reportShares.sharedBy,
      permission: reportShares.permission,
      createdAt: reportShares.createdAt,
      groupName: groups.name,
    })
    .from(reportShares)
    .leftJoin(groups, eq(reportShares.groupId, groups.id))
    .where(eq(reportShares.id, id))
    .get();
  if (!created) throw notFound('Share not found');
  return c.json(
    {
      id: created.id,
      reportId: created.reportId,
      groupId: created.groupId,
      groupName: created.groupName ?? '',
      sharedBy: created.sharedBy,
      permission: created.permission as 'view',
      createdAt: created.createdAt,
    } satisfies ReportShare,
    201,
  );
});

/** 공유 해제(owner). */
reportRoutes.delete('/:id/shares/:shareId', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const row = await ensureOwned(db, c.req.param('id'), user.userId);
  const share = await db
    .select({ id: reportShares.id })
    .from(reportShares)
    .where(and(eq(reportShares.id, c.req.param('shareId')), eq(reportShares.reportId, row.id)))
    .get();
  if (!share) throw notFound('Share not found');
  await db.delete(reportShares).where(eq(reportShares.id, share.id));
  return c.body(null, 204);
});

/* ── 리비전(버전 기록) ─────────────────────────────────────────── */

/** 리비전 목록(최신순, content 제외). */
reportRoutes.get('/:id/revisions', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  await ensureOwned(db, c.req.param('id'), userId);
  const rows = await db
    .select({
      id: revisions.id,
      reportId: revisions.reportId,
      label: revisions.label,
      isManual: revisions.isManual,
      createdAt: revisions.createdAt,
    })
    .from(revisions)
    .where(eq(revisions.reportId, c.req.param('id')))
    .orderBy(desc(revisions.createdAt))
    .all();
  const items: RevisionListItem[] = rows.map((r) => ({ ...r, isManual: r.isManual === 1 }));
  return c.json({ items });
});

/** 리비전 단건(content 포함 — 미리보기/되돌리기용). */
reportRoutes.get('/:id/revisions/:rid', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  await ensureOwned(db, c.req.param('id'), userId);
  const row = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.id, c.req.param('rid')), eq(revisions.reportId, c.req.param('id'))))
    .get();
  if (!row) throw notFound('Revision not found');
  return c.json(serializeRevision(row));
});

/** 수동 리비전 생성("이 버전 저장") — 현재 report 상태 스냅샷. */
const revisionCreateSchema = z.object({ label: z.string().max(50).optional() });
reportRoutes.post('/:id/revisions', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const rep = await ensureOwned(db, c.req.param('id'), userId);

  const parsed = revisionCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());

  const id = newId();
  await db.insert(revisions).values({
    id,
    reportId: rep.id,
    userId,
    content: rep.content,
    contentMd: rep.contentMd,
    templateOptions: rep.templateOptions,
    label: parsed.data.label ?? null,
    isManual: 1,
  });
  const created = await db.select().from(revisions).where(eq(revisions.id, id)).get();
  if (!created) throw notFound('Revision not found');
  return c.json(serializeRevision(created), 201);
});

/** 리비전으로 되돌리기 — report 의 content/options 를 리비전 스냅샷으로 덮어쓰기. */
reportRoutes.post('/:id/revisions/:rid/restore', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  await ensureOwned(db, c.req.param('id'), userId);
  const rev = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.id, c.req.param('rid')), eq(revisions.reportId, c.req.param('id'))))
    .get();
  if (!rev) throw notFound('Revision not found');

  await db
    .update(reports)
    .set({
      content: rev.content,
      contentMd: rev.contentMd,
      templateOptions: rev.templateOptions,
      updatedAt: isoNow(),
    })
    .where(eq(reports.id, c.req.param('id')));

  const row = await db.select().from(reports).where(eq(reports.id, c.req.param('id'))).get();
  if (!row) throw notFound('Report not found');
  return c.json(serializeReport(row));
});

/** 리비전 삭제. */
reportRoutes.delete('/:id/revisions/:rid', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  await ensureOwned(db, c.req.param('id'), userId);
  const rev = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.id, c.req.param('rid')), eq(revisions.reportId, c.req.param('id'))))
    .get();
  if (!rev) throw notFound('Revision not found');
  await db.delete(revisions).where(eq(revisions.id, rev.id));
  return c.body(null, 204);
});
