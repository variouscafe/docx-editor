import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

/** 다크모드 상태. auth 와 동일하게 zustand persist 로 localStorage('docx-theme') 에 보존. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggle: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    { name: "docx-theme" },
  ),
);

/** 현재 테마를 <html> 의 .dark 클래스에 반영. main.tsx 렌더 전(FOUC 방지) + 토글 시 호출. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
