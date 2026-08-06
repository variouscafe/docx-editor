import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppEnv } from '../types.js';
import { createDb, type Database } from '../db/index.js';
import { groups, groupMembers, groupInvitations, users, templates, reportShares } from '../db/schema.js';
import { newId, isoNow } from '../lib/id.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { jwtAuth } from '../middleware/auth.js';
import {
  getUserGroups,
  assertGroupMember,
  assertGroupManager,
  assertGroupOwner,
  acceptPendingInvitations,
} from '../lib/authz.js';
import type {
  Group,
  GroupDetailResponse,
  GroupInvitation,
  GroupMember,
  GroupRole,
  AddMemberResult,
  InvitationStatus,
  InviteRole,
} from '@shared/groups';

export const groupRoutes = new Hono<AppEnv>();
groupRoutes.use('*', jwtAuth);

const roleSchema = z.enum(['admin', 'member']);
const groupCreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});
const groupPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
});
const addMemberSchema = z.object({
  email: z.string().email(),
  role: roleSchema,
});
const updateMemberSchema = z.object({ role: roleSchema });

/* ── 직렬라이저 ─────────────────────────────────────────────────── */

function serializeGroup(row: typeof groups.$inferSelect, myRole: GroupRole, count: number): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerUserId,
    myRole,
    memberCount: count,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type MemberJoin = {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  joinedAt: string;
  email: string | null;
  name: string | null;
};

function serializeMember(m: MemberJoin, isMe: boolean): GroupMember {
  return {
    id: m.id,
    groupId: m.groupId,
    userId: m.userId,
    email: m.email ?? '',
    name: m.name,
    role: m.role as GroupRole,
    joinedAt: m.joinedAt,
    isMe,
  };
}

function serializeInvitation(row: typeof groupInvitations.$inferSelect): GroupInvitation {
  return {
    id: row.id,
    groupId: row.groupId,
    email: row.email,
    role: row.role as InviteRole,
    invitedBy: row.invitedBy,
    status: row.status as InvitationStatus,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
  };
}

/* ── 헬퍼 ───────────────────────────────────────────────────────── */

const memberSelect = {
  id: groupMembers.id,
  groupId: groupMembers.groupId,
  userId: groupMembers.userId,
  role: groupMembers.role,
  joinedAt: groupMembers.joinedAt,
  email: users.email,
  name: users.name,
} as const;

async function fetchMembership(
  db: Database,
  membershipId: string,
  currentUserId: string,
): Promise<GroupMember> {
  const row = await db
    .select(memberSelect)
    .from(groupMembers)
    .leftJoin(users, eq(groupMembers.userId, users.userId))
    .where(eq(groupMembers.id, membershipId))
    .get();
  if (!row) throw notFound('Member not found');
  return serializeMember(row, row.userId === currentUserId);
}

async function memberCount(db: Database, groupId: string): Promise<number> {
  const r = await db
    .select({ n: sql<number>`count(*)` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .get();
  return r?.n ?? 0;
}

/* ── 엔드포인트 ─────────────────────────────────────────────────── */

/** 내 그룹 목록(역할·멤버수). 호출마다 pending 초대 자동 수락. */
groupRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  await acceptPendingInvitations(db, user.userId, user.email);

  const memberships = await getUserGroups(db, user.userId);
  const roleMap = new Map(memberships.map((m) => [m.groupId, m.role]));
  const ids = [...roleMap.keys()];
  if (ids.length === 0) return c.json({ items: [] });

  const groupRows = await db.select().from(groups).where(inArray(groups.id, ids)).all();
  const counts = await db
    .select({ groupId: groupMembers.groupId, n: sql<number>`count(*)` })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, ids))
    .groupBy(groupMembers.groupId)
    .all();
  const countMap = new Map(counts.map((r) => [r.groupId, r.n]));

  const items = groupRows
    .map((g) => serializeGroup(g, roleMap.get(g.id)!, countMap.get(g.id) ?? 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  return c.json({ items });
});

/** 그룹 생성(생성자=owner). */
groupRoutes.post('/', async (c) => {
  const user = c.get('user');
  const parsed = groupCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const { name, description } = parsed.data;

  const id = newId();
  const db = createDb(c.env.DB);
  await db.insert(groups).values({
    id,
    name,
    description: description ?? null,
    ownerUserId: user.userId,
  });
  // 생성자를 owner 멤버로 등록(users 캐시는 jwtAuth 가 upsert).
  await db.insert(groupMembers).values({ id: newId(), groupId: id, userId: user.userId, role: 'owner' });

  const row = await db.select().from(groups).where(eq(groups.id, id)).get();
  if (!row) throw notFound('Group not found');
  return c.json(serializeGroup(row, 'owner', 1), 201);
});

/** 그룹 상세 + 멤버 목록(users join) + pending 초대(manager 에게만). */
groupRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  await acceptPendingInvitations(db, user.userId, user.email);
  const groupId = c.req.param('id');
  const role = await assertGroupMember(db, groupId, user.userId);

  const group = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw notFound('Group not found');

  const memberRows = await db
    .select(memberSelect)
    .from(groupMembers)
    .leftJoin(users, eq(groupMembers.userId, users.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt)
    .all();
  const members = memberRows.map((m) => serializeMember(m, m.userId === user.userId));

  let invitations: GroupInvitation[] = [];
  if (role === 'owner' || role === 'admin') {
    const invRows = await db
      .select()
      .from(groupInvitations)
      .where(and(eq(groupInvitations.groupId, groupId), eq(groupInvitations.status, 'pending')))
      .orderBy(groupInvitations.createdAt)
      .all();
    invitations = invRows.map(serializeInvitation);
  }

  const res: GroupDetailResponse = {
    group: serializeGroup(group, role, members.length),
    members,
    invitations,
  };
  return c.json(res);
});

/** 그룹 정보 수정(owner|admin). */
groupRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const parsed = groupPatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  const role = await assertGroupManager(db, groupId, user.userId);

  const { name, description } = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: isoNow() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  await db.update(groups).set(patch).where(eq(groups.id, groupId));

  const row = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!row) throw notFound('Group not found');
  return c.json(serializeGroup(row, role, await memberCount(db, groupId)));
});

/** 그룹 삭제(owner). FK 없음 → 수동 cascade. 그룹 공유 템플릿은 private 로 전환. */
groupRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  await assertGroupOwner(db, groupId, user.userId);

  await db.delete(reportShares).where(eq(reportShares.groupId, groupId));
  await db.delete(groupInvitations).where(eq(groupInvitations.groupId, groupId));
  await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
  await db
    .update(templates)
    .set({ visibility: 'private', groupId: null, updatedAt: isoNow() })
    .where(eq(templates.groupId, groupId));
  await db.delete(groups).where(eq(groups.id, groupId));
  return c.body(null, 204);
});

/** 멤버 추가(이메일). 캐시에 있으면 즉시 등록, 없으면 pending 초대. */
groupRoutes.post('/:id/members', async (c) => {
  const user = c.get('user');
  const parsed = addMemberSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  await assertGroupManager(db, groupId, user.userId);

  const email = parsed.data.email.toLowerCase().trim();
  const role = parsed.data.role;
  if (email === (user.email || '').toLowerCase()) throw badRequest('Cannot invite yourself');

  const target = await db.select().from(users).where(eq(users.email, email)).get();
  if (target) {
    const existing = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, target.userId)))
      .get();
    if (existing) throw conflict('Already a member');
    // 즉시 등록 시 동일 email 의 pending 초대 제거.
    await db
      .delete(groupInvitations)
      .where(and(eq(groupInvitations.groupId, groupId), eq(groupInvitations.email, email)));
    const memId = newId();
    await db.insert(groupMembers).values({ id: memId, groupId, userId: target.userId, role });
    const member = await fetchMembership(db, memId, user.userId);
    return c.json({ member } satisfies AddMemberResult, 201);
  }

  // 미가입 → pending 초대.
  const pending = await db
    .select({ id: groupInvitations.id })
    .from(groupInvitations)
    .where(
      and(
        eq(groupInvitations.groupId, groupId),
        eq(groupInvitations.email, email),
        eq(groupInvitations.status, 'pending'),
      ),
    )
    .get();
  if (pending) throw conflict('Invitation already pending');

  const invId = newId();
  await db.insert(groupInvitations).values({
    id: invId,
    groupId,
    email,
    role,
    invitedBy: user.userId,
    status: 'pending',
  });
  const row = await db.select().from(groupInvitations).where(eq(groupInvitations.id, invId)).get();
  if (!row) throw notFound('Invitation not found');
  return c.json({ invitation: serializeInvitation(row) } satisfies AddMemberResult, 201);
});

/** 멤버 역할 변경(owner|admin). owner 역할은 변경 불가. */
groupRoutes.patch('/:id/members/:uid', async (c) => {
  const user = c.get('user');
  const parsed = updateMemberSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw badRequest('Invalid body', 'bad_request', parsed.error.flatten());
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  const targetUid = c.req.param('uid');
  await assertGroupManager(db, groupId, user.userId);

  const mem = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUid)))
    .get();
  if (!mem) throw notFound('Member not found');
  if (mem.role === 'owner') throw badRequest('Cannot change owner role');

  await db.update(groupMembers).set({ role: parsed.data.role }).where(eq(groupMembers.id, mem.id));
  return c.json(await fetchMembership(db, mem.id, user.userId));
});

/** 멤버 제거/탈퇴. 본인은 탈퇴 가능(owner 제외), 타인 제거는 manager. owner 제거 불가. */
groupRoutes.delete('/:id/members/:uid', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  const targetUid = c.req.param('uid');

  const isSelf = targetUid === user.userId;
  if (!isSelf) await assertGroupManager(db, groupId, user.userId);

  const mem = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUid)))
    .get();
  if (!mem) throw notFound('Member not found');
  if (mem.role === 'owner') throw badRequest('Cannot remove owner');

  await db.delete(groupMembers).where(eq(groupMembers.id, mem.id));
  return c.body(null, 204);
});

/** pending 초대 취소(owner|admin). */
groupRoutes.post('/:id/invitations/:invId/revoke', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const groupId = c.req.param('id');
  await assertGroupManager(db, groupId, user.userId);

  const inv = await db
    .select()
    .from(groupInvitations)
    .where(and(eq(groupInvitations.id, c.req.param('invId')), eq(groupInvitations.groupId, groupId)))
    .get();
  if (!inv) throw notFound('Invitation not found');
  if (inv.status !== 'pending') throw badRequest('Invitation is not pending');

  await db
    .update(groupInvitations)
    .set({ status: 'revoked' })
    .where(eq(groupInvitations.id, inv.id));
  return c.body(null, 204);
});
