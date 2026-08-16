import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CircleCheck,
  Check,
  FileDown,
  FileText,
  Globe,
  Highlighter,
  History,
  Languages,
  LayoutTemplate,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/store/auth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { LANGUAGES, normalizeLanguage } from "@/i18n";

/**
 * 랜딩 페이지("/" 비로그인 전용) — 템플릿 기반 범용 문서 도구 포지셔닝.
 * 로그인 상태(accessToken)면 /reports 로 리다이렉트(OAuth fragment 복귀 포함 —
 * main.tsx 가 렌더 전 토큰을 소비하므로 첫 렌더에 바로 판정, flash 없음).
 * 카피는 실제 기능(템플릿 적용·그룹 공유·A4 미리보기·DOCX 내보내기·버전 기록) 기술.
 */
export function Landing() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  usePageMeta({ title: t("landing.metaTitle"), description: t("landing.metaDescription") });
  if (accessToken) return <Navigate to="/reports" replace />;
  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <SharingSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}

function LandingHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2" aria-label={t("nav.brand")}>
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{t("nav.brand")}</span>
        </a>
        <nav
          aria-label={t("nav.brand")}
          className="ml-4 hidden items-center gap-1 text-sm text-muted-foreground md:flex"
        >
          <a href="#features" className="rounded-md px-2 py-1 hover:text-foreground">
            {t("landing.nav.features")}
          </a>
          <a href="#how" className="rounded-md px-2 py-1 hover:text-foreground">
            {t("landing.nav.howItWorks")}
          </a>
          <a href="#sharing" className="rounded-md px-2 py-1 hover:text-foreground">
            {t("landing.nav.sharing")}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageMenu />
          <Button asChild variant="ghost" size="sm" className="hidden px-3 sm:inline-flex">
            <Link to="/login">{t("landing.nav.login")}</Link>
          </Button>
          <Button asChild size="sm" className="px-3">
            <Link to="/login">{t("landing.nav.getStarted")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** 언어 전환 드롭다운 — Settings.tsx 의 changeLanguage 패턴을 랜딩용으로 축약. */
function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const current = normalizeLanguage(i18n.language);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language.toggle")}>
          <Globe />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => void i18n.changeLanguage(lng)}
            className="justify-between"
          >
            {t(`language.name.${lng}` as const)}
            {current === lng && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeroSection() {
  const { t } = useTranslation();
  return (
    <section id="top" className="bg-gradient-to-b from-accent/40 to-background">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            {t("landing.hero.badge")}
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {t("landing.hero.title")}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("landing.hero.subtitle")}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild size="lg" className="h-11 gap-2 px-6 text-base">
              <Link to="/login">
                {t("landing.hero.ctaPrimary")}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
              <a href="#features">{t("landing.hero.ctaSecondary")}</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("landing.hero.note")}</p>
        </div>
        <DocumentMock />
      </div>
    </section>
  );
}

/** 에디터 미리보기를 연상시키는 CSS-only A4 문서 목업(장식 — 라인 시작 기호·형광펜·박스·핵심요약·꼬마글씨). */
function DocumentMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      {/* 뒤에 겹친 두 번째 장 — A4 페이지네이션 느낌 */}
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-md border bg-muted/40" />
      <div className="relative aspect-[210/297] rounded-md border bg-card p-6 shadow-xl ring-1 ring-foreground/5">
        <div className="mx-auto h-3.5 w-1/2 rounded bg-foreground/70" />
        <div className="mx-auto mt-2 h-2 w-1/3 rounded bg-muted-foreground/40" />
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-4 text-right text-xs font-semibold leading-none text-foreground">
              1.
            </span>
            <div className="h-2.5 w-3/5 rounded bg-foreground/50" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 text-right text-xs leading-none text-foreground">□</span>
            <div className="h-2 flex-1 rounded bg-foreground/25" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 text-right text-xs leading-none text-foreground">□</span>
            <div className="h-2 w-11/12 rounded bg-foreground/25" />
          </div>
          {/* 형광펜 */}
          <div className="flex items-center gap-2">
            <span className="w-4" />
            <div className="h-2 w-2/3 rounded bg-yellow-200 dark:bg-yellow-500/40" />
          </div>
          {/* 박스(solid) */}
          <div className="rounded-[2px] border-[1.5px] border-foreground/40 p-2">
            <div className="h-2 w-full rounded bg-foreground/20" />
            <div className="mt-1.5 h-2 w-4/5 rounded bg-foreground/20" />
          </div>
          <div className="ml-2 flex items-center gap-2">
            <span className="w-4 text-right text-xs leading-none text-foreground">•</span>
            <div className="h-2 w-4/5 rounded bg-foreground/25" />
          </div>
          <div className="ml-2 flex items-center gap-2">
            <span className="w-4 text-right text-xs leading-none text-foreground">•</span>
            <div className="h-2 w-2/3 rounded bg-foreground/25" />
          </div>
          {/* 핵심요약 [ ] */}
          <div className="flex items-stretch">
            <div className="w-1 rounded-l border-y-2 border-l-2 border-foreground/50" />
            <div className="h-4 flex-1 bg-accent/60" />
            <div className="w-1 rounded-r border-y-2 border-r-2 border-foreground/50" />
          </div>
          {/* 꼬마글씨 부연(파랑) */}
          <div className="ml-6 h-1.5 w-1/2 rounded bg-blue-600/50 dark:bg-blue-400/50" />
          <div className="h-2 w-full rounded bg-foreground/25" />
          <div className="h-2 w-10/12 rounded bg-foreground/25" />
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { key: "template", icon: LayoutTemplate },
  { key: "groupShare", icon: Users },
  { key: "formatting", icon: Highlighter },
  { key: "a4docx", icon: FileDown },
  { key: "history", icon: History },
  { key: "languages", icon: Languages },
] as const;

function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <section id="features" className="scroll-mt-16 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">{t("landing.features.title")}</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("landing.features.subtitle")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.key} className="gap-3 p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold">
                {t(`landing.features.${f.key}.title` as const)}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`landing.features.${f.key}.desc` as const)}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = ["1", "2", "3"] as const;

function HowItWorksSection() {
  const { t } = useTranslation();
  return (
    <section id="how" className="scroll-mt-16 border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">{t("landing.how.title")}</h2>
        <p className="mt-3 text-muted-foreground">{t("landing.how.subtitle")}</p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((n) => (
            <li key={n} className="space-y-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {n}
              </span>
              <h3 className="text-base font-semibold">{t(`landing.how.step${n}.title` as const)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`landing.how.step${n}.desc` as const)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SharingSection() {
  const { t } = useTranslation();
  return (
    <section
      id="sharing"
      className="scroll-mt-16 border-t bg-gradient-to-b from-accent/40 to-background"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t("landing.sharing.title")}</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{t("landing.sharing.desc")}</p>
          <ul className="mt-6 space-y-3">
            {(["point1", "point2", "point3"] as const).map((key) => (
              <li key={key} className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="text-sm">{t(`landing.sharing.${key}` as const)}</span>
              </li>
            ))}
          </ul>
        </div>
        <GroupShareMock />
      </div>
    </section>
  );
}

/** 그룹 공유 비주얼(장식) — 겹친 템플릿 카드 + 멤버 원. */
function GroupShareMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="relative rotate-1">
        <div className="absolute inset-0 translate-x-3 translate-y-3 -rotate-2 rounded-xl border bg-card/60" />
        <div className="relative space-y-3 rounded-xl border bg-card p-4 shadow-md ring-1 ring-foreground/5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutTemplate className="size-5" />
            </span>
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-2/3 rounded bg-foreground/50" />
              <div className="h-2 w-1/3 rounded bg-muted-foreground/30" />
            </div>
            <Users className="size-4 text-muted-foreground/60" />
          </div>
          <div className="space-y-1.5 border-t pt-3">
            <div className="h-2 w-full rounded bg-foreground/20" />
            <div className="h-2 w-11/12 rounded bg-foreground/20" />
            <div className="h-2 w-4/5 rounded bg-foreground/20" />
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="flex -space-x-2">
          {["bg-primary/15", "bg-chart-2/20", "bg-chart-3/20"].map((bg) => (
            <span
              key={bg}
              className={`flex size-9 items-center justify-center rounded-full border-2 border-background text-primary ${bg}`}
            >
              <User className="size-4" />
            </span>
          ))}
        </div>
        <div className="h-2 w-24 rounded bg-muted-foreground/30" />
      </div>
    </div>
  );
}

function CtaSection() {
  const { t } = useTranslation();
  return (
    <section className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">{t("landing.cta.title")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("landing.cta.desc")}</p>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg" className="h-11 gap-2 px-6 text-base">
            <Link to="/login">
              {t("landing.hero.ctaPrimary")}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="size-3.5" />
          </span>
          <span className="font-medium text-foreground">{t("nav.brand")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("landing.footer.tagline")}</span>
        </div>
        <p>{t("landing.footer.copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
