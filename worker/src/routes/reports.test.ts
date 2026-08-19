/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { env } from "cloudflare:test";

import app from "../index.js";
import { createDb, schema, type Database } from "../db/index.js";
import { signJwt } from "../crypto/jwt.js";
import type { Bindings } from "../env.js";
import type { Report } from "@shared/report";

import m0 from "../../migrations/0000_init.sql?raw";
import m1 from "../../migrations/0001_shared_auth.sql?raw";
import m2 from "../../migrations/0002_first_bloodaxe.sql?raw";
import m3 from "../../migrations/0003_red_hex.sql?raw";
import m4 from "../../migrations/0004_groups.sql?raw";
import m5 from "../../migrations/0005_public_share.sql?raw";
import m6 from "../../migrations/0006_military_giant_girl.sql?raw";
import m7 from "../../migrations/0007_chief_skrulls.sql?raw";

const ALL_MIGRATIONS = [m0, m1, m2, m3, m4, m5, m6, m7].join("\n");

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

const TEST_SECRET = "test-jwt-secret";
const USER = "user-conflict";

let db: Database;
let token = "";
/** app.request 에 넘길 env — 테스트용 JWT_SECRET 주입. */
let testEnv: Bindings;

beforeAll(async () => {
  const d1 = (env as unknown as Bindings).DB;
  for (const stmt of splitStatements(ALL_MIGRATIONS)) {
    await d1.prepare(stmt).run();
  }
  db = createDb(d1);
  token = await signJwt({ sub: USER, type: "access" }, TEST_SECRET, 600);
  testEnv = { ...(env as unknown as Bindings), JWT_SECRET: TEST_SECRET };
});

const authHeaders = () => ({ authorization: `Bearer ${token}` });

/** 테스트용 보고서 생성(API 경유) → Report 반환. */
async function createTestReport(): Promise<Report> {
  const res = await app.request(
    "/api/reports",
    {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ title: "t", content: { type: "doc" }, templateOptions: {} }),
    },
    testEnv,
  );
  if (!res.ok) throw new Error(`createTestReport failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Report;
}

async function patchReport(id: string, body: unknown) {
  const res = await app.request(
    `/api/reports/${id}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    testEnv,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

describe("PATCH /api/reports/:id — 낙관적 동시성 제어(baseUpdatedAt)", () => {
  it("baseUpdatedAt 미제공 시 기존 동작 유지(하위 호환) — 200 + updatedAt 응답", async () => {
    const r = await createTestReport();
    const { status, json } = await patchReport(r.id, { title: "제목 변경" });
    expect(status).toBe(200);
    expect((json as Report).title).toBe("제목 변경");
    expect(typeof (json as Report).updatedAt).toBe("string");
  });

  it("baseUpdatedAt 일치 시 정상 저장(200)", async () => {
    const r = await createTestReport();
    const { status, json } = await patchReport(r.id, {
      title: "v2",
      baseUpdatedAt: r.updatedAt,
    });
    expect(status).toBe(200);
    expect((json as Report).title).toBe("v2");
    expect((json as Report).updatedAt).not.toBe(r.updatedAt); // 갱신 시각 전진
  });

  it("baseUpdatedAt 불일치 시 409 conflict — 저장 거부 + 현재 updatedAt 반환", async () => {
    const r = await createTestReport();
    // 다른 세션에서 한 번 저장 → updatedAt 이동
    const first = await patchReport(r.id, { title: "다른 탭에서 저장" });
    expect(first.status).toBe(200);

    // 오래된 baseUpdatedAt(첫 응답 값)으로 저장 시도 → 충돌
    const stale = await patchReport(r.id, {
      title: "충돌 저장",
      baseUpdatedAt: r.updatedAt,
    });
    expect(stale.status).toBe(409);
    const err = (stale.json as { error?: { code?: string; details?: { updatedAt?: string } } }).error;
    expect(err?.code).toBe("conflict");
    expect(err?.details?.updatedAt).toBe((first.json as Report).updatedAt);

    // 저장이 거부됐는지 확인 — 제목은 "다른 탭에서 저장" 그대로
    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(row?.title).toBe("다른 탭에서 저장");
  });
});

describe("PUT /api/reports/:id/public-share — 공유 토글은 updatedAt 을 바꾸지 않는다", () => {
  it("토글 후에도 토글 전 baseUpdatedAt 으로 저장 성공(허위 409 방지)", async () => {
    const r = await createTestReport();
    // 공유 활성화(본문이 아닌 상태 변경)
    const share = await app.request(
      `/api/reports/${r.id}/public-share`,
      {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      },
      testEnv,
    );
    expect(share.status).toBe(200);
    // 토글은 실제로 반영됐는지 확인
    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(row?.shareEnabled).toBe(true);

    // 토글 전 updatedAt(baseUpdatedAt)으로 저장 — 409 없이 성공해야 한다.
    const { status, json } = await patchReport(r.id, {
      title: "토글 후 저장",
      baseUpdatedAt: r.updatedAt,
    });
    expect(status).toBe(200);
    expect((json as Report).title).toBe("토글 후 저장");
  });
});

describe("POST /api/reports/:id/revisions — 수동 리비전 정리(최근 100개)", () => {
  it("수동 리비전 100개 초과 시 오래된 것부터 삭제", async () => {
    const r = await createTestReport();

    // 기존 수동 리비전 100개 시드(createdAt 로 정렬 결정성 확보)
    for (let i = 0; i < 100; i++) {
      await db.insert(schema.revisions).values({
        id: `rev-seed-${i}`,
        reportId: r.id,
        userId: USER,
        content: "{}",
        contentMd: null,
        templateOptions: "{}",
        label: `seed-${i}`,
        isManual: 1,
        // SQLite CURRENT_TIMESTAMP 포맷(UTC) — 초 단위 격차로 순서 보장
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i))
          .toISOString()
          .replace("T", " ")
          .replace("Z", ""),
      });
    }

    // 101번째 수동 리비전 생성 → 가장 오래된 seed-0 이 정리돼 100개 유지
    const res = await app.request(
      `/api/reports/${r.id}/revisions`,
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ label: "new" }),
      },
      testEnv,
    );
    expect(res.status).toBe(201);

    const manuals = await db
      .select({ id: schema.revisions.id })
      .from(schema.revisions)
      .where(and(eq(schema.revisions.reportId, r.id), eq(schema.revisions.isManual, 1)))
      .all();
    expect(manuals.length).toBe(100);
    expect(manuals.some((m) => m.id === "rev-seed-0")).toBe(false);
    expect(manuals.some((m) => m.id === "rev-seed-1")).toBe(true);
  });
});

describe("휴지통(소프트 삭제) — DELETE/restore/purge/sweep", () => {
  it("DELETE 는 행을 남기고 deleted_at 만 설정 — 일반 목록에서 사라지고 trash 에만 나타남", async () => {
    const r = await createTestReport();

    const del = await app.request(`/api/reports/${r.id}`, { method: "DELETE", headers: authHeaders() }, testEnv);
    expect(del.status).toBe(204);

    // 행 존재(소프트 삭제)
    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(row?.deletedAt).toBeTruthy();

    // 일반 목록 제외 / trash 목록 포함(deletedAt 전달)
    const normal = await app.request("/api/reports", { headers: authHeaders() }, testEnv);
    const trash = await app.request("/api/reports?trash=1", { headers: authHeaders() }, testEnv);
    const normalIds = ((await normal.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    const trashItems = ((await trash.json()) as { items: { id: string; deletedAt: string | null }[] }).items;
    expect(normalIds).not.toContain(r.id);
    const mine = trashItems.find((i) => i.id === r.id);
    expect(mine?.deletedAt).toBeTruthy();
  });

  it("삭제된 보고서는 GET/PATCH/재DELETE 모두 404(존재 은닉)", async () => {
    const r = await createTestReport();
    await app.request(`/api/reports/${r.id}`, { method: "DELETE", headers: authHeaders() }, testEnv);

    const got = await app.request(`/api/reports/${r.id}`, { headers: authHeaders() }, testEnv);
    const patched = await app.request(
      `/api/reports/${r.id}`,
      { method: "PATCH", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) },
      testEnv,
    );
    const again = await app.request(`/api/reports/${r.id}`, { method: "DELETE", headers: authHeaders() }, testEnv);
    expect(got.status).toBe(404);
    expect(patched.status).toBe(404);
    expect(again.status).toBe(404);
  });

  it("restore — 휴지통에서 복원되어 일반 목록에 재등장", async () => {
    const r = await createTestReport();
    await app.request(`/api/reports/${r.id}`, { method: "DELETE", headers: authHeaders() }, testEnv);

    const res = await app.request(`/api/reports/${r.id}/restore`, { method: "POST", headers: authHeaders() }, testEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Report).deletedAt).toBeNull();

    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(row?.deletedAt).toBeNull();
  });

  it("정상 문서 restore 시 400(not_deleted)", async () => {
    const r = await createTestReport();
    const res = await app.request(`/api/reports/${r.id}/restore`, { method: "POST", headers: authHeaders() }, testEnv);
    expect(res.status).toBe(400);
  });

  it("purge — 행·리비전 즉시 삭제", async () => {
    const r = await createTestReport();
    await db.insert(schema.revisions).values({
      id: "rev-purge", reportId: r.id, userId: USER,
      content: "{}", contentMd: null, templateOptions: "{}", isManual: 1,
    });

    const res = await app.request(`/api/reports/${r.id}/purge`, { method: "DELETE", headers: authHeaders() }, testEnv);
    expect(res.status).toBe(204);

    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    const rev = await db.select().from(schema.revisions).where(eq(schema.revisions.id, "rev-purge")).get();
    expect(row).toBeUndefined();
    expect(rev).toBeUndefined();
  });

  it("만료 sweep — 30일 경과 문서는 trash 조회 시 영구 삭제된다", async () => {
    const r = await createTestReport();
    await db
      .update(schema.reports)
      .set({ deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
      .where(eq(schema.reports.id, r.id));

    const trash = await app.request("/api/reports?trash=1", { headers: authHeaders() }, testEnv);
    const ids = ((await trash.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids).not.toContain(r.id);

    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(row).toBeUndefined();
  });
});

describe("POST /api/reports/:id/duplicate — 문서 복제", () => {
  it("사본 생성 — 새 id·호출자 소유·초안, content/options 동일, 원본 무변경", async () => {
    const r = await createTestReport();

    const res = await app.request(
      `/api/reports/${r.id}/duplicate`,
      { method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ title: "내 사본" }) },
      testEnv,
    );
    expect(res.status).toBe(201);
    const copy = (await res.json()) as Report;
    expect(copy.id).not.toBe(r.id);
    expect(copy.title).toBe("내 사본");
    expect(copy.status).toBe("draft");
    expect(copy.permission).toBe("owner");
    expect(copy.content).toEqual(r.content);
    expect(copy.templateOptions).toEqual(r.templateOptions);

    // 원본은 그대로
    const orig = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id)).get();
    expect(orig?.title).toBe("t");
  });

  it("title 미제공 시 기본 접미사 — '원제 (사본)'", async () => {
    const r = await createTestReport();
    const res = await app.request(
      `/api/reports/${r.id}/duplicate`,
      { method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({}) },
      testEnv,
    );
    expect(res.status).toBe(201);
    expect(((await res.json()) as Report).title).toBe("t (사본)");
  });

  it("원본에 퍼블릭 공유가 활성 상태여도 사본은 미공유(토큰 미복사)", async () => {
    const r = await createTestReport();
    await db
      .update(schema.reports)
      .set({ shareEnabled: true, shareToken: "tok-dup-test" })
      .where(eq(schema.reports.id, r.id));

    const res = await app.request(
      `/api/reports/${r.id}/duplicate`,
      { method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({}) },
      testEnv,
    );
    const copy = (await res.json()) as Report;
    const row = await db.select().from(schema.reports).where(eq(schema.reports.id, copy.id)).get();
    expect(row?.shareEnabled).toBe(false);
    expect(row?.shareToken).toBeNull();
  });
});

describe("GET /api/reports?q= — 제목+본문 전문 검색", () => {
  it("본문(content_md) 키워드로 검색되고 snippet 이 내려온다", async () => {
    const r = await createTestReport();
    await patchReport(r.id, {
      content: { type: "doc" },
      contentMd: "# 보고서\n\n예산 집행 특이사항을 점검했다.\n",
    });

    // 제목은 "t" — 본문 키워드로만 hit
    const res = await app.request("/api/reports?q=특이사항", { headers: authHeaders() }, testEnv);
    expect(res.status).toBe(200);
    const items = ((await res.json()) as { items: { id: string; snippet: string | null }[] }).items;
    const hit = items.find((i) => i.id === r.id);
    expect(hit).toBeTruthy();
    expect(hit!.snippet).toContain("특이사항");
  });

  it("제목 매치 문서는 snippet 이 null(본문 hit 아님)", async () => {
    const res = await app.request("/api/reports?q=t", { headers: authHeaders() }, testEnv);
    expect(res.status).toBe(200);
    const items = ((await res.json()) as { items: { title: string; snippet: string | null }[] }).items;
    // "t" 는 제목에 hit — 본문 발췌 없음
    const byTitle = items.find((i) => i.title === "t");
    if (byTitle) expect(byTitle.snippet).toBeNull();
  });

  it("본문에도 제목에도 없는 키워드는 결과 없음", async () => {
    const res = await app.request(
      "/api/reports?q=이런키워드는없다",
      { headers: authHeaders() },
      testEnv,
    );
    const items = ((await res.json()) as { items: unknown[] }).items;
    expect(items).toHaveLength(0);
  });

  it("ASCII 대소문자 무시 — 본문 'Budget' 을 'budget' 으로 hit", async () => {
    const r = await createTestReport();
    await patchReport(r.id, {
      content: { type: "doc" },
      contentMd: "Budget review for FY26.\n",
    });
    const res = await app.request("/api/reports?q=budget", { headers: authHeaders() }, testEnv);
    const items = ((await res.json()) as { items: { id: string }[] }).items;
    expect(items.some((i) => i.id === r.id)).toBe(true);
  });
});
