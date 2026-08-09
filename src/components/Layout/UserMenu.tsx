import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { User, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/store/auth";
import { authWorkerHttp } from "@/api/client";

/**
 * 우측 끝 사용자 메뉴 — 계정 정보 + 설정(페이지로 이동) + 로그아웃.
 * AppShell(목록)·ReportEditor(에디터) 헤더 양쪽에서 공유.
 * 테마·언어 선택은 /settings 페이지로 이동해 처리(메뉴엔 진입점만 둔다).
 */
export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = useAuthStore((s) => s.name);
  const email = useAuthStore((s) => s.email);
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
        <Button variant="ghost" size="icon" title={t("nav.account")}>
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name ?? t("nav.user")}</span>
            {email && <span className="text-xs text-muted-foreground">{email}</span>}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <Settings /> {t("settings.title")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => void handleLogout()}>
          <LogOut /> {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
