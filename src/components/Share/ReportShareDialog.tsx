import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      toast.success(t("share.group.shared"));
      await load();
    } catch {
      toast.error(t("share.group.shareFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await unshareReport(reportId, shareId);
      toast.success(t("share.group.unshared"));
      await load();
    } catch {
      toast.error(t("share.group.unshareFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("share.group.title")}</DialogTitle>
          <DialogDescription>{t("share.group.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-foreground/80">{t("share.group.sharedGroups")}</Label>
            {loading ? (
              <Skeleton className="mt-1.5 h-9 w-full" />
            ) : shares.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t("share.group.empty")}</p>
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
                      <Trash2 /> {t("share.group.unshare")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <Label className="text-xs font-medium text-foreground/80">{t("share.group.add")}</Label>
            {available.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {groups.length === 0
                  ? t("share.group.noGroups")
                  : t("share.group.allShared")}
              </p>
            ) : (
              <div className="mt-1.5 flex items-center gap-2">
                <Select value={picked} onValueChange={setPicked}>
                  <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
                    <SelectValue placeholder={t("share.group.pick")} />
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
                  {t("common.add")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
