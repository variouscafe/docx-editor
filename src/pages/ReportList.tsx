import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { listReports, deleteReport } from "@/api/reports";
import type { ReportListItem } from "@shared/report";
import { usePageMeta } from "@/hooks/usePageMeta";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SCOPES = [
  { value: "all", key: "all" },
  { value: "mine", key: "mine" },
  { value: "shared", key: "shared" },
] as const;

export default function ReportList() {
  const { t, i18n } = useTranslation();
  usePageMeta({ title: `${t("nav.brand")} · ${t("reportList.title")}` });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const scope = params.get("scope") ?? "all";
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listReports());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("reportList.deleteConfirm"))) return;
    await deleteReport(id);
    toast.success(t("reportList.deleted"));
    await load();
  };

  const setScope = (s: string) => {
    const next = new URLSearchParams(params);
    if (s === "all") next.delete("scope");
    else next.set("scope", s);
    setParams(next, { replace: true });
  };

  // 사이드바 status 필터(all/recent/published/draft) + scope(전체/내/공유) 결합. 둘 다 메모리 필터.
  const visible = useMemo(
    () =>
      items.filter((r) => {
        if (scope === "mine" && r.permission !== "owner") return false;
        if (scope === "shared" && r.permission !== "view") return false;
        if (filter === "published") return r.status === "published";
        if (filter === "draft") return r.status !== "published";
        if (filter === "recent") return Date.now() - new Date(r.updatedAt).getTime() < WEEK_MS;
        return true;
      }),
    [items, scope, filter],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("reportList.title")}</h2>
        <Button onClick={() => navigate("/reports/new")}>
          <Plus /> {t("nav.newReport")}
        </Button>
      </div>

      {/* scope 토글 — 전체/내 보고서/공유됨 */}
      <div className="mb-4 inline-flex gap-0.5 overflow-hidden rounded-md border bg-muted/50 p-0.5">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            onClick={() => setScope(s.value)}
            className={`flex h-8 items-center rounded-[5px] px-3 text-xs font-medium transition-colors ${
              scope === s.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`reportList.scope.${s.key}` as const)}
          </button>
        ))}
      </div>

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <FileText className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {scope === "shared"
              ? t("reportList.empty.shared")
              : items.length === 0
                ? t("reportList.empty.none")
                : t("reportList.empty.filter")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => {
            const isShared = r.permission === "view";
            return (
              <li
                key={r.id}
                className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <button
                  onClick={() => navigate(`/reports/${r.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.title || t("common.untitled")}</span>
                    {isShared && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-300">
                        <Eye className="size-3" /> {t("reportList.readOnly")}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {isShared
                      ? `${r.ownerName ? r.ownerName + " · " : ""}${r.groupName ? r.groupName + " · " : ""}${new Date(r.updatedAt).toLocaleString(i18n.language)}`
                      : `${r.status === "published" ? t("reportList.status.published") : t("reportList.status.draft")} · ${new Date(r.updatedAt).toLocaleString(i18n.language)}`}
                  </div>
                </button>
                {!isShared && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(r.id)}
                    className="text-muted-foreground hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
                    title={t("common.delete")}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
