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
