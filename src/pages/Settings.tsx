import { useTranslation } from "react-i18next";
import { Sun, Moon, Check } from "lucide-react";
import { useThemeStore, type Theme } from "@/store/theme";
import { LANGUAGES, normalizeLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * 설정 페이지 — 화면 테마(라이트/다크)·표시 언어(9개) 선택.
 * 우측 UserMenu 의 "설정" 항목으로 진입. AppShell 안에 렌더되므로 별도 헤더/뒤로가기 없음
 * (사이드바로 다른 영역 이동). 테마 변경은 setTheme → App.tsx 구독이 applyTheme 로 반영.
 */
export function Settings() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const currentLang = normalizeLanguage(i18n.language);

  const themes: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t("theme.light") },
    { value: "dark", icon: Moon, label: t("theme.dark") },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

      {/* 화면 테마 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.theme")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {themes.map(({ value, icon: Icon, label }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{label}</span>
                {active && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* 표시 언어 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.language")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {LANGUAGES.map((lng) => {
            const active = currentLang === lng;
            return (
              <button
                key={lng}
                type="button"
                onClick={() => void i18n.changeLanguage(lng)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="font-medium">{t(`language.name.${lng}` as const)}</span>
                {active && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
