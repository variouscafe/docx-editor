import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { listReports, deleteReport } from "@/api/reports";
import type { ReportListItem } from "@shared/report";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ReportList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filter = params.get("filter") ?? "all";
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
    if (!window.confirm("이 보고서를 삭제하시겠습니까?")) return;
    await deleteReport(id);
    toast.success("삭제됨");
    await load();
  };

  // 사이드바 필터는 클라이언트 사이드(listReports 는 q 검색만 지원). status/최근은 메모리 필터.
  const visible = useMemo(
    () =>
      items.filter((r) => {
        if (filter === "published") return r.status === "published";
        if (filter === "draft") return r.status !== "published";
        if (filter === "recent") return Date.now() - new Date(r.updatedAt).getTime() < WEEK_MS;
        return true;
      }),
    [items, filter],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">내 보고서</h2>
        <Button onClick={() => navigate("/reports/new")}>
          <Plus /> 새 보고서
        </Button>
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
            {items.length === 0
              ? "보고서가 없습니다. 새 보고서를 만들어보세요."
              : "이 필터에 해당하는 보고서가 없습니다."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.id}
              className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <button
                onClick={() => navigate(`/reports/${r.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate font-medium">{r.title || "(제목 없음)"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.status === "published" ? "게시됨" : "초안"} · {new Date(r.updatedAt).toLocaleString()}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleDelete(r.id)}
                className="text-muted-foreground hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
                title="삭제"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
