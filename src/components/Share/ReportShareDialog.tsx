import { useState, useEffect, useCallback } from "react";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listReportShares, shareReport, unshareReport } from "@/api/reports";
import { listGroups } from "@/api/groups";
import type { Group, ReportShare } from "@shared/groups";

interface Props {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 보고서 공유 다이얼로그(owner). 그룹에 공유(읽기 전용) 추가·해제. */
export function ReportShareDialog({ reportId, open, onOpenChange }: Props) {
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const [s, g] = await Promise.all([listReportShares(reportId), listGroups()]);
      setShares(s);
      setGroups(g);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) {
      setPicked("");
      void load();
    }
  }, [open, load]);

  const sharedGroupIds = new Set(shares.map((s) => s.groupId));
  const available = groups.filter((g) => !sharedGroupIds.has(g.id));

  const handleAdd = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await shareReport(reportId, { groupId: picked });
      setPicked("");
      toast.success("그룹에 공유했어요");
      await load();
    } catch {
      toast.error("공유에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await unshareReport(reportId, shareId);
      toast.success("공유를 해제했어요");
      await load();
    } catch {
      toast.error("해제에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>보고서 공유</DialogTitle>
          <DialogDescription>
            그룹에 공유하면 그룹원이 이 보고서를 읽고 DOCX로 내보낼 수 있습니다(편집은 작성자만).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-foreground/80">공유 중인 그룹</Label>
            {loading ? (
              <Skeleton className="mt-1.5 h-9 w-full" />
            ) : shares.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">아직 공유된 그룹이 없습니다.</p>
            ) : (
              <ul className="mt-1.5 divide-y rounded-lg border">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                    <Users className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{s.groupName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => void handleRemove(s.id)}
                    >
                      <Trash2 /> 해제
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <Label className="text-xs font-medium text-foreground/80">그룹 추가</Label>
            {available.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {groups.length === 0
                  ? "가입한 그룹이 없습니다."
                  : "모든 그룹에 이미 공유되어 있습니다."}
              </p>
            ) : (
              <div className="mt-1.5 flex items-center gap-2">
                <Select value={picked} onValueChange={setPicked}>
                  <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
                    <SelectValue placeholder="그룹 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!picked || busy} onClick={() => void handleAdd()}>
                  추가
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
