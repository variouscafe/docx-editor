/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:test";

import { createDb, schema, type Database } from "../db/index.js";
import type { Bindings } from "../env.js";
import {
  ensureReportAccess,
  ensurePublicReport,
  getGroupRole,
  assertGroupManager,
  assertGroupOwner,
} from "./authz.js";
import { ApiHttpError } from "./errors.js";

import m0 from "../../migrations/0000_init.sql?raw";
import m1 from "../../migrations/0001_shared_auth.sql?raw";
import m2 from "../../migrations/0002_first_bloodaxe.sql?raw";
import m3 from "../../migrations/0003_red_hex.sql?raw";
import m4 from "../../migrations/0004_groups.sql?raw";
import m5 from "../../migrations/0005_public_share.sql?raw";

const ALL_MIGRATIONS = [m0, m1, m2, m3, m4, m5].join("\n");

/** 마이그레이션 SQL → 개별 statement 로 분리(-- 주석 라인 제거 후 ';' 기준). */
function splitStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const DB = () => (env as unknown as Bindings).DB;
let db: Database;

beforeAll(async () => {
  const d1 = DB();
  for (const stmt of splitStatements(ALL_MIGRATIONS)) {
    await d1.prepare(stmt).run();
  }
  db = createDb(d1);
});

async function seedReport(id: string, ownerUserId: string) {
  await db
    .insert(schema.reports)
    .values({ id, userId: ownerUserId, title: "t", content: "{}", templateOptions: "{}" });
}

/** 퍼블릭 공유 상태로 보고서 시드(활성 여부 + 토큰). */
async function seedPublicShare(id: string, enabled: boolean, token: string | null) {
  await db
    .update(schema.reports)
    .set({ shareEnabled: enabled, shareToken: token })
    .where(eq(schema.reports.id, id));
}

async function seedGroup(id: string, ownerUserId: string) {
  await db.insert(schema.groups).values({ id, name: `g-${id}`, ownerUserId });
}

async function seedMember(groupId: string, userId: string, role: "owner" | "admin" | "member") {
  await db
    .insert(schema.groupMembers)
    .values({ id: `${groupId}:${userId}`, groupId, userId, role });
}

async function seedShare(reportId: string, groupId: string, sharedBy: string) {
  await db
    .insert(schema.reportShares)
    .values({ id: `${reportId}:${groupId}`, reportId, groupId, sharedBy });
}

describe("ensureReportAccess — 보고서 접근 권한(존재 은닉 포함)", () => {
  it("owner 는 접근 허용(isOwner=true)", async () => {
    await seedReport("r1", "userA");
    const res = await ensureReportAccess(db, "r1", "userA");
    expect(res.isOwner).toBe(true);
    expect(res.row.id).toBe("r1");
  });

  it("공유받은 그룹 멤버는 접근 허용(isOwner=false)", async () => {
    await seedReport("r2", "userA");
    await seedGroup("g2", "userA");
    await seedMember("g2", "userB", "member");
    await seedShare("r2", "g2", "userA");
    const res = await ensureReportAccess(db, "r2", "userB");
    expect(res.isOwner).toBe(false);
    expect(res.row.id).toBe("r2");
  });

  it("무관한 제3자는 notFound(404) — 존재 은닉", async () => {
    await seedReport("r3", "userA");
    await seedGroup("g3", "userA");
    await seedMember("g3", "userC", "member"); // userC 는 다른 그룹 멤버
    await expect(ensureReportAccess(db, "r3", "userX")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("존재하지 않는 보고서는 notFound(404)", async () => {
    await expect(ensureReportAccess(db, "nope", "userA")).rejects.toBeInstanceOf(ApiHttpError);
    await expect(ensureReportAccess(db, "nope", "userA")).rejects.toMatchObject({ status: 404 });
  });
});

describe("그룹 역할 게이트", () => {
  it("getGroupRole — 멤버는 role, 비멤버는 null", async () => {
    await seedGroup("g4", "userA");
    await seedMember("g4", "userA", "owner");
    await seedMember("g4", "userB", "admin");
    expect(await getGroupRole(db, "g4", "userA")).toBe("owner");
    expect(await getGroupRole(db, "g4", "userB")).toBe("admin");
    expect(await getGroupRole(db, "g4", "userZ")).toBeNull();
  });

  it("assertGroupManager — owner/admin 통과, member 는 forbidden(403)", async () => {
    await seedGroup("g5", "userA");
    await seedMember("g5", "userA", "owner");
    await seedMember("g5", "userB", "admin");
    await seedMember("g5", "userC", "member");
    expect(await assertGroupManager(db, "g5", "userA")).toBe("owner");
    expect(await assertGroupManager(db, "g5", "userB")).toBe("admin");
    await expect(assertGroupManager(db, "g5", "userC")).rejects.toMatchObject({ status: 403 });
    await expect(assertGroupManager(db, "g5", "userZ")).rejects.toMatchObject({ status: 403 });
  });

  it("assertGroupOwner — owner 만 통과, admin/member 는 forbidden(403)", async () => {
    await seedGroup("g6", "userA");
    await seedMember("g6", "userA", "owner");
    await seedMember("g6", "userB", "admin");
    await assertGroupOwner(db, "g6", "userA"); // not throw
    await expect(assertGroupOwner(db, "g6", "userB")).rejects.toMatchObject({ status: 403 });
  });
});

describe("ensurePublicReport — 퍼블릭 링크 접근(토큰 capability)", () => {
  it("활성 + 토큰 일치 → row 반환", async () => {
    await seedReport("p1", "userA");
    await seedPublicShare("p1", true, "tok-p1");
    const row = await ensurePublicReport(db, "tok-p1");
    expect(row.id).toBe("p1");
  });

  it("비활성(shareEnabled=false) → notFound(404) — 공유 해제 시 접근 불가", async () => {
    await seedReport("p2", "userA");
    await seedPublicShare("p2", false, "tok-p2");
    await expect(ensurePublicReport(db, "tok-p2")).rejects.toMatchObject({ status: 404 });
  });

  it("알 수 없는 토큰 → notFound(404) — 존재 은닉", async () => {
    await seedReport("p3", "userA");
    await seedPublicShare("p3", true, "tok-p3");
    await expect(ensurePublicReport(db, "totally-unknown")).rejects.toBeInstanceOf(ApiHttpError);
    await expect(ensurePublicReport(db, "totally-unknown")).rejects.toMatchObject({ status: 404 });
  });

  it("토큰 없는 보고서(미공유) → notFound(404)", async () => {
    await seedReport("p4", "userA"); // shareEnabled=false, token=null (기본값)
    await expect(ensurePublicReport(db, "tok-p4")).rejects.toMatchObject({ status: 404 });
  });
});
