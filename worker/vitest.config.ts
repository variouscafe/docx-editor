import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath, URL } from "node:url";

/**
 * Worker 통합 테스트 — cloudflareTest 플러그인이 Workers 런타임 + Miniflare D1 구성.
 * wrangler.toml 의 DB 바인딩을 매 실행 격리된 로컬 SQLite 로 노출(원격 D1 미접근).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
