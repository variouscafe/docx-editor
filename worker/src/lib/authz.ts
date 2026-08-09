/**
 * 그룹·멤버십 권한 헬퍼. 모든 쿼리는 D1(Drizzle) 기반, FK 없이 user_id(=JWT.sub) 로 판별.
 * 존재 은닉이 필요한 곳은 notFound, 권한 부족은 forbidden.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { groupMembers, groupInvitations, reports, reportShares } from '../db/schema.js';
import { newId } from './id.js';
import { forbidden, notFound } from './errors.js';
import type { GroupRole } from '@shared/groups';

/** 호출 사용자가 속한 그룹 + 역할 목록. */
export async function getUserGroups(
  db: Database,
  userId: string,
): Promise<{ groupId: string; role: GroupRole }[]> {
  const rows = await db
    .select({ groupId: groupMembers.groupId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));
  return rows.map((r) => ({ groupId: r.groupId, role: r.role as GroupRole }));
}

/** 가시성 쿼리용 — 호출 사용자의 그룹 id 목록(빈 배열 가능). */
export async function getGroupIds(db: Database, userId: string): Promise<string[]> {
  const rows = await getUserGroups(db, userId);
  return rows.map((r) => r.groupId);
}

/** 그룹에서의 역할(비멤버면 null). */
export async function getGroupRole(
  db: Database,
  groupId: string,
  userId: string,
): Promise<GroupRole | null> {
  const row = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .get();
  return row ? (row.role as GroupRole) : null;
}

/** 그룹 멤버 권한 위반 시 forbidden. 역할 반환. */
export async function assertGroupMember(
  db: Database,
  groupId: string,
  userId: string,
): Promise<GroupRole> {
  const role = await getGroupRole(db, groupId, userId);
  if (!role) throw forbidden('Not a group member');
  return role;
}

/** 그룹 관리자(owner|admin) 권한 위반 시 forbidden. 역할 반환. */
export async function assertGroupManager(
  db: Database,
  groupId: string,
  userId: string,
): Promise<GroupRole> {
  const role = await assertGroupMember(db, groupId, userId);
  if (role !== 'owner' && role !== 'admin') throw forbidden('Manager permission required');
  return role;
}

/** 그룹 owner 권한 위반 시 forbidden. */
export async function assertGroupOwner(db: Database, groupId: string, userId: string): Promise<void> {
  const role = await getGroupRole(db, groupId, userId);
  if (role !== 'owner') throw forbidden('Owner permission required');
}

/**
 * 보고서 접근 권한 확인(존재+권한).
 * owner(작성자) 이거나, 공유받은 그룹(reportShares) 의 멤버여야 접근 가능.
 * 비접근 시 notFound(존재 은닉). 반환: { row(전체), isOwner }.
 */
export async function ensureReportAccess(
  db: Database,
  reportId: string,
  userId: string,
): Promise<{ row: typeof reports.$inferSelect; isOwner: boolean }> {
  const row = await db.select().from(reports).where(eq(reports.id, reportId)).get();
  if (!row) throw notFound('Report not found');
  if (row.userId === userId) return { row, isOwner: true };
  const myGroups = await getGroupIds(db, userId);
  if (myGroups.length > 0) {
    const share = await db
      .select({ id: reportShares.id })
      .from(reportShares)
      .where(and(eq(reportShares.reportId, reportId), inArray(reportShares.groupId, myGroups)))
      .get();
    if (share) return { row, isOwner: false };
  }
  throw notFound('Report not found');
}

/**
 * 퍼블릭 링크로 보고서 접근(로그인 없음).
 * share_token 일치 + share_enabled=true 인 보고서만 노출. 그 외는 notFound(존재 은닉).
 * 토큰은 추측 불가 capability 이므로 열거 공격 불가.
 */
export async function ensurePublicReport(
  db: Database,
  token: string,
): Promise<typeof reports.$inferSelect> {
  const row = await db
    .select()
    .from(reports)
    .where(and(eq(reports.shareToken, token), eq(reports.shareEnabled, true)))
    .get();
  if (!row) throw notFound('Report not found');
  return row;
}

/**
 * 호출 사용자의 email 에 pending 상태인 초대를 모두 수락(멤버 등록 + 초대 accepted).
 * GET /api/groups(및 :id) 에서 호출 → 로그인만 했으면 초대받은 그룹에 자동 가입.
 * idempotent(이미 멤버면 초대만 accepted 처리).
 */
export async function acceptPendingInvitations(
  db: Database,
  userId: string,
  email: string,
): Promise<void> {
  const e = email.toLowerCase();
  if (!e) return;
  const pending = await db
    .select()
    .from(groupInvitations)
    .where(and(eq(groupInvitations.email, e), eq(groupInvitations.status, 'pending')))
    .all();
  if (pending.length === 0) return;
  for (const inv of pending) {
    // 이미 멤버면 중복 가입 방지(초대만 accepted).
    const existing = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, inv.groupId), eq(groupMembers.userId, userId)))
      .get();
    if (!existing) {
      await db.insert(groupMembers).values({
        id: newId(),
        groupId: inv.groupId,
        userId,
        role: inv.role, // 'admin'|'member'
      });
    }
    await db
      .update(groupInvitations)
      .set({ status: 'accepted', acceptedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(groupInvitations.id, inv.id));
  }
}
