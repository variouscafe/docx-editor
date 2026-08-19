import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { FileText, Plus, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useCommandStore } from "@/store/command";
import { UserMenu } from "./UserMenu";

// status 필터(published/draft)는 게시 UI 가 없어 도달 불가능해 제거 — 전체/최근만 유지.
const NAV_FILTERS = [
  { value: "all", key: "all" },
  { value: "recent", key: "recent" },
] as const;

function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const active = params.get("filter") ?? "all";
  const groupsActive = location.pathname.startsWith("/groups");
  return (
    <Sidebar>
      <SidebarHeader>
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-2 px-2 py-2 text-left"
        >
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="size-4" />
          </div>
          <span className="text-sm font-semibold">{t("nav.brand")}</span>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.reports")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate("/reports/new")}>
                  <Plus /> {t("nav.newReport")}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.groups")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={groupsActive}
                  onClick={() => navigate("/groups")}
                >
                  <Users /> {t("nav.groups")}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.filters")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_FILTERS.map((f) => (
                <SidebarMenuItem key={f.value}>
                  <SidebarMenuButton
                    isActive={active === f.value}
                    onClick={() => setParams(f.value === "all" ? {} : { filter: f.value })}
                  >
                    {t(`nav.filter.${f.key}` as const)}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * 보호된 목록 영역의 공통 크롬.
 * 헤더(사이드바 토글 / ⌘K 검색 트리거 / 테마 토글 / 프로필) + 좌측 필터 사이드바 + 메인.
 * 에디터(/reports/:id, /new)는 풀스크린 집중 모드로 AppShell 을 쓰지 않는다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => useCommandStore.getState().setOpen(true)}
              title={t("nav.searchKbd")}
            >
              <Search />
              <span className="hidden sm:inline">{t("nav.search")}</span>
              <kbd className="ml-1 hidden text-[10px] sm:inline">⌘K</kbd>
            </Button>
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
