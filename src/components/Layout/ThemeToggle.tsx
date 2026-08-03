import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/store/theme";

/** 라이트/다크 토글. AppShell 헤더와 에디터 헤더에서 공유. */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="테마 전환">
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
