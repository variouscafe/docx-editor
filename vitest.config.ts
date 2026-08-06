import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Vitest 설정 — shared/(FE·BE 공용 순수 로직) 단위 테스트.
 * 미리보기와 DOCX 내보내기가 공유하는 단일 진실(symbols/options)의 회귀를 잡는다.
 * vite.config.ts 의 alias 와 동일하게 @ / @shared 매핑.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
