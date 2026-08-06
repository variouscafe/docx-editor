import { Hono } from 'hono';
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import type { AppEnv } from '../types.js';
import { createDb, type Database } from '../db/index.js';
import { templates, groups } from '../db/schema.js';
import { newId, isoNow } from '../lib/id.js';
import { badRequest, notFound } from '../lib/errors.js';
import { jwtAuth } from '../middleware/auth.js';
import { getGroupIds, assertGroupMember } from '../lib/authz.js';
import type { ReportTemplateRow, TemplateVisibility } from '@shared/report';

const visibilitySchema = z.enum(['private', 'public', 'group']);

const templateCreateSchema = z.object({
  name: z.string().min(1),
  options: z.any(),
  isDefault: z.boolean().optional(),
  visibility: visibilitySchema.optional(),
  groupId: z.string().nullable().optional(),
});
const templatePatchSchema = templateCreateSchema.partial();
const templateDuplicateSchema = z.object({
  name: z.string().min(1).optional(),
});

export const templateRoutes = new Hono<AppEnv>();
templateRoutes.use('*', jwtAuth);

function serialize(
  row: typeof templates.$inferSelect,
  isOwner: boolean,
  groupName?: string | null,
): ReportTemplateRow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    options: JSON.parse(row.options),
    isDefault: !!row.isDefault,
    visibility: row.visibility as TemplateVisibility,
    isOwner,
    groupId: row.groupId,
    groupName: groupName ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 호출자 그룹 id → 이름 매핑(그룹 템플릿 표시용). */
async function groupNames(db: Database, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(inArray(groups.id, ids))
    .all();
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * 기본 템플릿 배타 정합 — 한 사용자의 기본 템플릿은 1개.
 * 대상 행(exceptId)을 제외한 같은 소유자의 나머지 isDefault 를 0으로.
 * 대상 행 자체의 isDefault=1 은 호출부의 본 update 에서 설정.
 */
async function reconcileDefault(db: Database, userId: string, exceptId: string) {
  await db
    .update(templates)
    .set({ isDefault: 0 })
    .where(and(eq(templates.userId, userId), ne(templates.id, exceptId)));
}

/**
 * 템플릿 목록 — 내 템플릿(모든 visibility) + 타인 공개(public) + 타인 그룹 공유(멤버).
 * 빌트인은 FE shared/presets.
 */
templateRoutes.get('/', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const gIds = await getGroupIds(db, userId);
  const rows = await db
    .select()
    .from(templates)
    .where(
      or(
        eq(templates.userId, userId),
        eq(templates.visibility, 'public'),
        ...(gIds.length
          ? [and(eq(templates.visibility, 'group'), inArray(templates.groupId, gIds))]
          : []),
      ),
    )
    .orderBy(desc(templates.updatedAt));
  const gNames = await groupNames(db, gIds);
  return c.json({ items: rows.map((r) => serialize(r, r.userId === userId, gNames.get(r.groupId ?? ''))) });
});

/** 내 기본 템플릿 — 새 보고서 초기화용. 없으면 204. */
templateRoutes.get('/default', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const row = await db
    .select()
    .from(templates)
    .where(and(eq(templates.userId, userId), eq(templates.isDefault, 1)))
    .get();
  if (!row) return c.body(null, 204);
  return c.json(serialize(row, true));
});

templateRoutes.post('/', async (c) => {
  const userId = c.get('user').userId;
  const parsed = templateCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { name, options, isDefault, visibility, groupId } = parsed.data;

  const db = createDb(c.env.DB);
  const vis: TemplateVisibility = visibility ?? 'private';
  let gid: string | null = null;
  if (vis === 'group') {
    if (!groupId) throw badRequest('groupId required for group visibility');
    await assertGroupMember(db, groupId, userId);
    gid = groupId;
  }

  const id = newId();
  await db.insert(templates).values({
    id,
    userId,
    name,
    options: JSON.stringify(options),
    visibility: vis,
    groupId: gid,
    isDefault: isDefault ? 1 : 0,
  });
  if (isDefault) await reconcileDefault(db, userId, id);

  const row = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .get();
  if (!row) throw notFound('Template not found');
  return c.json(serialize(row, true), 201);
});

templateRoutes.patch('/:id', async (c) => {
  const userId = c.get('user').userId;
  const parsed = templatePatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { name, options, isDefault, visibility, groupId } = parsed.data;

  const db = createDb(c.env.DB);
  // 소유권 체크(id + user_id) — 비소유자는 존재 자체를 은닉(404).
  const existing = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, c.req.param('id')), eq(templates.userId, userId)))
    .get();
  if (!existing) throw notFound('Template not found');

  const patch: Record<string, unknown> = { updatedAt: isoNow() };
  if (name !== undefined) patch.name = name;
  if (options !== undefined) patch.options = JSON.stringify(options);
  if (visibility !== undefined) {
    if (visibility === 'group') {
      if (!groupId) throw badRequest('groupId required for group visibility');
      await assertGroupMember(db, groupId, userId);
      patch.visibility = 'group';
      patch.groupId = groupId;
    } else {
      // private | public → 그룹 공유 해제
      patch.visibility = visibility;
      patch.groupId = null;
    }
  }
  if (isDefault !== undefined) patch.isDefault = isDefault ? 1 : 0;

  await db.update(templates).set(patch).where(eq(templates.id, existing.id));
  if (isDefault) await reconcileDefault(db, userId, existing.id);

  const row = await db.select().from(templates).where(eq(templates.id, existing.id)).get();
  if (!row) throw notFound('Template not found');
  return c.json(serialize(row, true));
});

templateRoutes.delete('/:id', async (c) => {
  const userId = c.get('user').userId;
  const db = createDb(c.env.DB);
  const row = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, c.req.param('id')), eq(templates.userId, userId)))
    .get();
  if (!row) throw notFound('Template not found');
  await db.delete(templates).where(eq(templates.id, row.id));
  // 기본 템플릿이 삭제돼도 자동 재지정 안 함 → GET /default 가 204, FE 는 빌트인 폴백.
  return c.body(null, 204);
});

/** 복제 — 내 템플릿(모든 visibility) 또는 타인 공개 템플릿을 새 사본(비공개)으로 생성. */
templateRoutes.post('/:id/duplicate', async (c) => {
  const userId = c.get('user').userId;
  const parsed = templateDuplicateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());

  const db = createDb(c.env.DB);
  const gIds = await getGroupIds(db, userId);
  // 소스 조회 — 호출자에게 보이는 것(내 것 OR 공개 OR 그룹 멤버)만. 타인 private → 404(존재 은닉).
  const src = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, c.req.param('id')),
        or(
          eq(templates.userId, userId),
          eq(templates.visibility, 'public'),
          ...(gIds.length
            ? [and(eq(templates.visibility, 'group'), inArray(templates.groupId, gIds))]
            : []),
        ),
      ),
    )
    .get();
  if (!src) throw notFound('Template not found');

  const id = newId();
  const name = (parsed.data.name ?? `${src.name} (사본)`).slice(0, 100);
  await db.insert(templates).values({
    id,
    userId,
    name,
    options: src.options, // 이미 stringified JSON
    visibility: 'private',
    groupId: null, // 복제본은 항상 비공개
    isDefault: 0,
  });

  const row = await db.select().from(templates).where(eq(templates.id, id)).get();
  if (!row) throw notFound('Template not found');
  return c.json(serialize(row, true), 201);
});
