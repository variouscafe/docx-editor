import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2, Save } from "lucide-react";
import type { Report, RevisionListItem } from "@shared/report";
import {
  listRevisions,
  createRevision,
  restoreRevision,
  deleteRevision,
} from "@/api/reports";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  reportId?: string;
  onRestored: (report: Report) => void;
  /**
   * 되돌리기 직전 호출(선택) — 상위에서 진행 중/대기 중 저장(debounce PATCH)을
   * flush 하도록 await 한다. 늦게 도착하는 PATCH 가 되돌린 내용을 덮어쓰는
   * 경쟁을 방지한다.
   */
  onBeforeRestore?: () => Promise<void>;
  /** 미저장 로컬 편집(dirty) 존재 여부 — 되돌리기 확인 문구에 경고 추가. */
  hasUnsavedChanges?: boolean;
  /** 상위 ⋯ 더 보기 메뉴가 열고 닫음(제어형). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** SQLite CURRENT_TIMESTAMP("YYYY-MM-DD HH:MM:SS" UTC) → 로컬 표시(선택 언어 로케일). */
function fmt(ts: string, lng?: string): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(lng);
}

type ConfirmAction = { type: "restore" | "delete"; rid: string } | null;

/**
 * 버전 기록(리비전) 패널.
 * - "현재 버전 저장"(수동 체크포인트) + 자동 리비전 표시.
 * - 항목 → 되돌리기(AlertDialog) / 삭제(AlertDialog).
 * 자동 리비전은 BE(PATCH 저장 시 3분 간격)에서 생성됨.
 */
export function VersionHistory({
  reportId,
  onRestored,
  onBeforeRestore,
  hasUnsavedChanges,
  open,
  onOpenChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<RevisionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      setItems(await listRevisions(reportId));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleSave = async () => {
    if (!reportId) return;
    setBusy(true);
    try {
      await createRevision(reportId, { label: saveName.trim() || undefined });
      setSaveOpen(false);
      setSaveName("");
      toast.success(t("versionHistory.saved"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!reportId || !action) return;
    setBusy(true);
    try {
      if (action.type === "restore") {
        // 진행 중/대기 중 저장을 먼저 flush — 이후 도착하는 PATCH 가 되돌린
        // 내용을 덮어쓰는 경쟁 방지.
        await onBeforeRestore?.();
        const report = await restoreRevision(reportId, action.rid);
        onRestored(report);
        onOpenChange(false);
        toast.success(t("versionHistory.restored"));
      } else {
        await deleteRevision(reportId, action.rid);
        toast.success(t("versionHistory.deleted"));
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0">
          <DialogHeader>
            <DialogTitle>{t("versionHistory.title")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto py-2">
            {loading ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("common.loading")}</p>
            ) : items.length === 0 ? (
              <p className="whitespace-pre-line py-8 text-center text-xs text-muted-foreground">
                {t("versionHistory.empty")}
              </p>
            ) : (
              items.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded px-2 py-2 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {r.label || (r.isManual ? t("versionHistory.manualVersion") : t("versionHistory.autoVersion"))}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fmt(r.createdAt, i18n.language)}</div>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      r.isManual
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.isManual ? t("versionHistory.manual") : t("versionHistory.auto")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy}
                    onClick={() => setConfirmAction({ type: "restore", rid: r.id })}
                    title={t("versionHistory.restore")}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => setConfirmAction({ type: "delete", rid: r.id })}
                    title={t("common.delete")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(true)}
              disabled={busy || !reportId}
            >
              <Save className="size-3.5" />
              {t("versionHistory.saveCurrent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 현재 버전 저장(이름 입력) */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("versionHistory.saveCurrent")}</DialogTitle>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t("versionHistory.namePlaceholder")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleSave()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 되돌리기 / 삭제 확인 */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "restore" ? t("versionHistory.restore") : t("versionHistory.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "restore"
                ? // 미저장 로컬 편집이 있으면 버려짐을 경고하는 별도 문구 사용.
                  hasUnsavedChanges
                  ? t("versionHistory.restoreUnsavedDesc")
                  : t("versionHistory.restoreConfirmDesc")
                : t("versionHistory.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirmAction?.type === "delete" && "bg-destructive text-white hover:bg-destructive/90")}
              onClick={() => void handleConfirm()}
            >
              {confirmAction?.type === "restore" ? t("versionHistory.restoreAction") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
