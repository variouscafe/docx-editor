import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RefreshCw, Loader2, ExternalLink, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicShare, setPublicShare } from "@/api/reports";
import type { PublicShareState } from "@shared/report";

interface Props {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_STATE: PublicShareState = { enabled: false, token: null };

/** 퍼블릭 링크 공유 다이얼로그(owner). 로그인 없이 누구나 볼 수 있는 읽기 전용 링크 발급·해제. */
export function PublicShareDialog({ reportId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<PublicShareState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      setState(await getPublicShare(reportId));
    } catch {
      setState(DEFAULT_STATE);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const shareUrl = state.token ? `${window.location.origin}/share/${state.token}` : "";

  /** 활성/비활성 토글. */
  const handleToggle = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await setPublicShare(reportId, { enabled });
      setState(next);
      toast.success(enabled ? t("share.public.enabled") : t("share.public.disabled"));
    } catch {
      toast.error(t("share.public.changeFailed"));
    } finally {
      setBusy(false);
    }
  };

  /** 새 링크(토큰) 발급 — 이전 링크는 즉시 무효. */
  const handleRegenerate = async () => {
    if (busy) return;
    if (!window.confirm(t("share.public.regenerateConfirm"))) return;
    setBusy(true);
    try {
      const next = await setPublicShare(reportId, { regenerate: true });
      setState(next);
      toast.success(t("share.public.regenerated"));
    } catch {
      toast.error(t("share.public.regenerateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("share.public.copied"));
    } catch {
      toast.error(t("share.public.copyFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("share.public.title")}</DialogTitle>
          <DialogDescription>{t("share.public.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 활성 토글 */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-start gap-2.5">
              <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t("share.public.toggle")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("share.public.toggleDesc")}</p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-[18px] w-8" />
            ) : (
              <Switch
                checked={state.enabled}
                onCheckedChange={(v) => void handleToggle(v)}
                disabled={busy}
              />
            )}
          </div>

          {/* 링크 / 상태 */}
          {!loading && state.enabled && state.token && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 self-start break-all rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs">
                  {shareUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => void handleCopy()}
                  disabled={busy}
                  title={t("share.public.copy")}
                >
                  <Copy />
                </Button>
                <Button variant="outline" size="icon" className="shrink-0" asChild title={t("share.public.open")}>
                  <a href={shareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => void handleRegenerate()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t("share.public.regenerate")}
              </Button>
            </div>
          )}

          {!loading && state.enabled && !state.token && (
            <p className="text-[11px] text-muted-foreground">{t("share.public.generating")}</p>
          )}

          {!loading && !state.enabled && (
            <p className="text-[11px] text-muted-foreground">{t("share.public.off")}</p>
          )}
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
