import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { FileText, Plus, Search, LogOut, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuthStore } from "@/store/auth";
import { authWorkerHttp } from "@/api/client";
import { useCommandStore } from "@/store/command";
import { ThemeToggle } from "./ThemeToggle";

const NAV_FILTERS = [
  { value: "all", label: "전체" },
  { value: "recent", label: "최근" },
  { value: "published", label: "게시됨" },
  { value: "draft", label: "초안" },
] as const;

function ProfileMenu() {
  const navigate = useNavigate();
  const email = useAuthStore((s) => s.email);
  const name = useAuthStore((s) => s.name);
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);

  const handleLogout = async () => {
    try {
      await authWorkerHttp.post("/auth/logout", { body: { refreshToken } });
    } catch {
      /* ignore */
    }
    logout();
    navigate("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="계정">
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name ?? "사용자"}</span>
            {email && <span className="text-xs text-muted-foreground">{email}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleLogout()}>
          <LogOut /> 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar() {
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
          <span className="text-sm font-semibold">Suseona Docs</span>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>보고서</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate("/reports/new")}>
                  <Plus /> 새 보고서
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>그룹</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={groupsActive}
                  onClick={() => navigate("/groups")}
                >
                  <Users /> 그룹
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>필터</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_FILTERS.map((f) => (
                <SidebarMenuItem key={f.value}>
                  <SidebarMenuButton
                    isActive={active === f.value}
                    onClick={() => setParams(f.value === "all" ? {} : { filter: f.value })}
                  >
                    {f.label}
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
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => useCommandStore.getState().setOpen(true)}
              title="검색 (⌘K)"
            >
              <Search />
              <span className="hidden sm:inline">검색</span>
              <kbd className="ml-1 hidden text-[10px] sm:inline">⌘K</kbd>
            </Button>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
