import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";
import DocxPreview from "@/components/Preview/DocxPreview";
import { getPublicReport } from "@/api/reports";
import { normalizeOptions } from "@shared/options";
import type { PublicReportView as PublicReport } from "@shared/report";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: PublicReport };

/**
 * 퍼블릭 링크 읽기 전용 뷰(로그인 없음).
 * - AppShell 없는 최소 크롬.
 * - DocxPreview 를 읽기 전용(editable=false 기본값)으로 렌더.
 * - 무효/해제된 링크는 404 → 안내 메시지.
 */
export default function PublicReportView() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    if (!token) {
      setState({ kind: "error", message: t("publicView.invalidLink") });
      return;
    }
    getPublicReport(token)
      .then((report) => {
        if (!cancelled) setState({ kind: "ready", report });
      })
      .catch((err: Error & { status?: number }) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err.status === 404 ? t("publicView.notFound") : t("publicView.loadError"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  // 검색엔진 색인 방지(공유 링크는 비공개 capability).
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-muted/30">
      <header className="flex items-center gap-2 border-b bg-background px-4 py-2.5">
        <Link
          to="/reports"
          aria-label={t("publicView.homeLink")}
          title={t("publicView.homeLink")}
          className="shrink-0 text-xl leading-none transition-opacity hover:opacity-80"
        >
          🌼
        </Link>
        {state.kind === "ready" && (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {state.report.title}
          </span>
        )}
      </header>

      <main className="flex-1 overflow-auto">
        {state.kind === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertCircle className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        )}

        {state.kind === "ready" && (
          <DocxPreview
            json={state.report.content}
            options={normalizeOptions(state.report.templateOptions)}
          />
        )}
      </main>
    </div>
  );
}
