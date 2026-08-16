/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";

import app from "../index.js";
import { createDb, type Database } from "../db/index.js";
import { uploads } from "../db/schema.js";
import { signJwt } from "../crypto/jwt.js";
import type { Bindings } from "../env.js";

import m0 from "../../migrations/0000_init.sql?raw";
import m1 from "../../migrations/0001_shared_auth.sql?raw";
import m2 from "../../migrations/0002_first_bloodaxe.sql?raw";
import m3 from "../../migrations/0003_red_hex.sql?raw";
import m4 from "../../migrations/0004_groups.sql?raw";
import m5 from "../../migrations/0005_public_share.sql?raw";
import m6 from "../../migrations/0006_military_giant_girl.sql?raw";

const ALL_MIGRATIONS = [m0, m1, m2, m3, m4, m5, m6].join("\n");

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
const USER = "user-uploads";

/** 1×1 PNG(투명) — 매직바이트 89 50 4E 47 스니프 통과용 실제 최소 이미지. */
const PNG_1PX_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function pngBytes(): Uint8Array {
  const bin = atob(PNG_1PX_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let db: Database;
let token = "";
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

function imageForm(bytes: Uint8Array | string, type = "image/png", dims?: { w: number; h: number }): FormData {
  const fd = new FormData();
  fd.append("file", new File([bytes], "img.png", { type }));
  if (dims) {
    fd.append("width", String(dims.w));
    fd.append("height", String(dims.h));
  }
  return fd;
}

async function postUpload(fd: FormData, headers: Record<string, string> = authHeaders()) {
  const res = await app.request("/api/uploads", { method: "POST", headers, body: fd }, testEnv);
  return { status: res.status, json: await res.json().catch(() => null) };
}

describe("POST /api/uploads — 이미지 업로드", () => {
  it("유효 PNG + 치수 → 201 + R2 객체 + D1 행", async () => {
    const { status, json } = await postUpload(imageForm(pngBytes(), "image/png", { w: 1, h: 1 }));
    expect(status).toBe(201);
    const body = json as { id: string; url: string; width: number | null; height: number | null };
    expect(body.url).toBe(`/api/images/${body.id}`);
    expect(body.width).toBe(1);

    const obj = await testEnv.IMAGES.head(`uploads/${body.id}`);
    expect(obj).not.toBeNull();
    expect(obj?.httpMetadata?.contentType).toBe("image/png");

    const row = await db.select().from(uploads);
    expect(row.some((r) => r.id === body.id && r.userId === USER && r.mime === "image/png")).toBe(true);
  });

  it("선언은 png 이나 실제 바이트는 텍스트 → 400", async () => {
    const { status } = await postUpload(imageForm("not an image at all", "image/png"));
    expect(status).toBe(400);
  });

  it("10MB 초과 → 413", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const { status } = await postUpload(imageForm(big, "image/png"));
    expect(status).toBe(413);
  });

  it("Bearer 없음 → 401", async () => {
    const { status } = await postUpload(imageForm(pngBytes()), {});
    expect(status).toBe(401);
  });
});

describe("GET /api/images/:id — 무인증 조회(capability UUID)", () => {
  it("업로드된 이미지 → 200 + content-type + immutable 캐시 + etag", async () => {
    const { json } = await postUpload(imageForm(pngBytes(), "image/png", { w: 1, h: 1 }));
    const id = (json as { id: string }).id;

    const res = await app.request(`/api/images/${id}`, {}, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const etag = res.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(new Uint8Array(await res.arrayBuffer()).length).toBe(pngBytes().length);

    // etag 조건부 요청 → 304.
    const res304 = await app.request(
      `/api/images/${id}`,
      { headers: { "if-none-match": etag! } },
      testEnv,
    );
    expect(res304.status).toBe(304);
  });

  it("존재하지 않는 uuid → 404, 비uuid 형식 → 404", async () => {
    const missing = await app.request(
      "/api/images/00000000-0000-4000-8000-000000000000",
      {},
      testEnv,
    );
    expect(missing.status).toBe(404);
    const malformed = await app.request("/api/images/../../etc/passwd", {}, testEnv);
    expect([404, 400]).toContain(malformed.status);
  });
});
