import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 로컬 로그인은 공용 suseona-auth(Pages Function)가 필요 → `wrangler pages dev` 사용.
    // /api/* 는 절대 VITE_API_URL + CORS 로 호출.
  },
});
