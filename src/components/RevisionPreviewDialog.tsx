import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw } from "lucide-react";
import type { Revision } from "@shared/report";
import { getRevision } from "@/api/reports";
import { lineDiff, collapseDiff } from "@/utils/lineDiff";
import DocxPreview from "@/components/Preview/DocxPreview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  reportId: string;
  revisionId: string;
  /** 현재 문서 content_md 산출 getter — 열릴 때 1회 스냅샷(이후 편집·되돌리기와 무관).
   *  미제공 시 변경사항(diff) 탭은 숨김(미리보기만). */
  getCurrentContentMd?: () => string;
  onClose: () => void;
  /** "이 버전으로 되돌리기" — 상위(VersionHistory)의 확인 플로우로 연결. */
  onRestore: (rid: string) => void;
}

type Tab = "preview" | "diff";

/**
 * 리비전 미리보기 다이얼로그 — 버전 기록 항목 클릭 시.
 *  - 미리보기: 되돌릴 대상 리비전을 실제 A4 미리보기(리비전 저장 시점 templateOptions)로 렌더.
 *  - 변경사항: 현재 문서 ↔ 리비전의 content_md 라인 diff(LCS). removed=되돌리면 사라지는
 *    내용, added=되돌리면 생기는 내용. 에디터 인스턴스 없이 getRevision JSON만 소비.
 */
export default function RevisionPreviewDialog({
  reportId,
  revisionId,
  getCurrentContentMd,
  onClose,
  onRestore,
}: Props) {
  const { t, i18n } = useTranslation();
  const [revision, setRevision] = useState<Revision | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("preview");
  const [currentMd, setCurrentMd] = useState("");

  useEffect(() => {
    let active = true;
    setRevision(null);
    setError(false);
    setTab("preview");
    setCurrentMd(getCurrentContentMd?.() ?? "");
    getRevision(reportId, revisionId)
      .then((r) => {
        if (active) setRevision(r);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [reportId, revisionId, getCurrentContentMd]);

  const diff = useMemo(() => {
    if (!revision || !getCurrentContentMd) return null;
    return lineDiff(currentMd, revision.contentMd ?? "");
  }, [revision, currentMd, getCurrentContentMd]);

  const stats = useMemo(() => {
    if (!diff) return null;
    const added = diff.ops
      .filter((o) => o.type === "added")
      .reduce((n, o) => n + o.lines.length, 0);
    const removed = diff.ops
      .filter((o) => o.type === "removed")
      .reduce((n, o) => n + o.lines.length, 0);
    return { added, removed };
  }, [diff]);

  const label = revision
    ? revision.label ||
      (revision.isManual
        ? t("versionHistory.manualVersion")
        : t("versionHistory.autoVersion"))
    : "";
  const fmtTs = (ts: string) => {
    const d = new Date(ts.replace(" ", "T") + "Z");
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(i18n.language);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] w-[min(900px,94vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm">{label}</DialogTitle>
            {revision && (
              <span className="text-xs text-muted-foreground">
                {fmtTs(revision.createdAt)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {/* 탭 전환 — diff 는 현재 문서 비교 기준(getter)이 있을 때만. */}
              <div className="inline-flex rounded-md bg-muted p-0.5">
                {(["preview", "diff"] as Tab[])
                  .filter((key) => key === "preview" || !!getCurrentContentMd)
                  .map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        tab === key
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setTab(key)}
                    >
                      {t(`versionHistory.tab.${key}`)}
                    </button>
                  ))}
              </div>
              {revision && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(revision.id)}
                >
                  <RotateCcw className="size-3.5" />
                  {t("versionHistory.restore")}
                </Button>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            {t("versionHistory.previewDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!revision ? (
            error ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t("versionHistory.loadFailed")}
              </p>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto size-5 animate-spin" />
              </p>
            )
          ) : tab === "preview" ? (
            <div className="p-4">
              <DocxPreview
                json={revision.content}
                options={revision.templateOptions}
                editable={false}
              />
            </div>
          ) : (
            <div className="p-4">
              {diff?.tooLarge ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("versionHistory.diffTooLarge")}
                </p>
              ) : stats && stats.added + stats.removed === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("versionHistory.diffNone")}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t("versionHistory.diffLegend", {
                      added: stats?.added ?? 0,
                      removed: stats?.removed ?? 0,
                    })}
                  </p>
                  <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
                    {collapseDiff(diff?.ops ?? [], 2).map((op, i) =>
                      op.type === "skipped" ? (
                        <div
                          key={i}
                          className="bg-muted/40 py-1 text-center text-[11px] text-muted-foreground"
                        >
                          ⋯ {t("versionHistory.diffSkipped", { count: op.count })}
                        </div>
                      ) : (
                        op.lines.map((line, j) => {
                          // 마지막 op 의 마지막 라인은 split("\n") 이 만든 꼬리 빈 라인일 수 있음 — 그대로 둔다(높이 유지)
                          const kind =
                            op.type === "added"
                              ? "add"
                              : op.type === "removed"
                                ? "del"
                                : "";
                          return (
                            <div
                              key={`${i}-${j}`}
                              className={cn(
                                "flex gap-2 px-2 py-px font-mono text-xs leading-5",
                                kind === "add" &&
                                  "bg-green-500/10 text-green-700 dark:text-green-400",
                                kind === "del" &&
                                  "bg-red-500/10 text-red-700 dark:text-red-400",
                              )}
                            >
                              <span className="w-3 shrink-0 select-none text-muted-foreground">
                                {kind === "add" ? "+" : kind === "del" ? "−" : ""}
                              </span>
                              <span className="whitespace-pre-wrap break-words">
                                {line || " "}
                              </span>
                            </div>
                          );
                        })
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
