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
  build: {
    rollupOptions: {
      output: {
        // 대형 청크(index 651kB, DocxPreview 508kB) 분할 — 자주 바뀌는 앱 코드와
        // 캐싱 효율이 좋은 벤더(react/tiptap/radix)를 분리한다.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "tiptap";
          if (id.includes("radix-ui")) return "radix";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("scheduler"))
            return "react-vendor";
          if (id.includes("i18next")) return "i18n";
          if (id.includes("lucide-react")) return "icons";
          return undefined;
        },
      },
    },
  },
});
