import { useState, useCallback, useEffect } from "react";
import { History, RotateCcw, Trash2, Save } from "lucide-react";
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
  DialogTrigger,
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
}

/** SQLite CURRENT_TIMESTAMP("YYYY-MM-DD HH:MM:SS" UTC) → 로컬 표시. */
function fmt(ts: string): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

type ConfirmAction = { type: "restore" | "delete"; rid: string } | null;

/**
 * 버전 기록(리비전) 패널.
 * - "현재 버전 저장"(수동 체크포인트) + 자동 리비전 표시.
 * - 항목 → 되돌리기(AlertDialog) / 삭제(AlertDialog).
 * 자동 리비전은 BE(PATCH 저장 시 3분 간격)에서 생성됨.
 */
export function VersionHistory({ reportId, onRestored }: Props) {
  const [open, setOpen] = useState(false);
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
      toast.success("버전이 저장됐습니다");
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
        const report = await restoreRevision(reportId, action.rid);
        onRestored(report);
        setOpen(false);
        toast.success("해당 버전으로 되돌렸습니다");
      } else {
        await deleteRevision(reportId, action.rid);
        toast.success("버전 기록이 삭제됐습니다");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!reportId}
            className="shrink-0"
            title="버전 기록"
          >
            <History />
            <span className="hidden sm:inline">버전</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md gap-0">
          <DialogHeader>
            <DialogTitle>버전 기록</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto py-2">
            {loading ? (
              <p className="py-8 text-center text-xs text-muted-foreground">불러오는 중…</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                저장된 버전이 없습니다.
                <br />
                자동(수정 후 약 3분 간격) 또는 “현재 버전 저장”으로 생성됩니다.
              </p>
            ) : (
              items.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded px-2 py-2 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {r.label || (r.isManual ? "수동 버전" : "자동 버전")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fmt(r.createdAt)}</div>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      r.isManual
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.isManual ? "수동" : "자동"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy}
                    onClick={() => setConfirmAction({ type: "restore", rid: r.id })}
                    title="이 버전으로 되돌리기"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => setConfirmAction({ type: "delete", rid: r.id })}
                    title="삭제"
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
              현재 버전 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 현재 버전 저장(이름 입력) */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>현재 버전 저장</DialogTitle>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="버전 이름(선택사항)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void handleSave()}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 되돌리기 / 삭제 확인 */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "restore" ? "이 버전으로 되돌리기" : "버전 기록 삭제"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "restore"
                ? "현재 편집 내용이 해당 버전으로 교체됩니다. 계속하시겠습니까?"
                : "이 버전 기록을 삭제할까요?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirmAction?.type === "delete" && "bg-destructive text-white hover:bg-destructive/90")}
              onClick={() => void handleConfirm()}
            >
              {confirmAction?.type === "restore" ? "되돌리기" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
