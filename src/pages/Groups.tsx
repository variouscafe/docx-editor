import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listGroups, createGroup } from "@/api/groups";
import type { Group, GroupRole } from "@shared/groups";

/** 역할 → 라벨/스타일(문서 내 pill 패턴 재사용). 라벨은 호출부 t 로 번역. */
export function roleBadge(role: GroupRole, t: TFunction): { label: string; cls: string } {
  switch (role) {
    case "owner":
      return { label: t("groupDetail.role.owner"), cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "admin":
      return { label: t("groupDetail.role.admin"), cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
    default:
      return { label: t("groupDetail.role.member"), cls: "bg-muted text-muted-foreground" };
  }
}

export default function Groups() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listGroups());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const g = await createGroup({ name: name.trim(), description: description.trim() || undefined });
      toast.success(t("groups.created"));
      setOpen(false);
      setName("");
      setDescription("");
      navigate(`/groups/${g.id}`);
    } catch {
      toast.error(t("groups.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("groups.title")}</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus /> {t("groups.create")}
        </Button>
      </div>

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-lg border bg-card px-4 py-3">
              <Skeleton className="h-4 w-1/3" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <Users className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t("groups.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((g) => {
            const badge = roleBadge(g.myRole, t);
            return (
              <li key={g.id}>
                <button
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Users className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{g.name}</div>
                    {g.description ? (
                      <div className="truncate text-xs text-muted-foreground">{g.description}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{t("groups.memberCount", { count: g.memberCount })}</div>
                    )}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groups.createTitle")}</DialogTitle>
            <DialogDescription>{t("groups.createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grp-name" className="text-xs font-medium text-foreground/80">
                {t("groups.nameLabel")}
              </Label>
              <Input
                id="grp-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("groups.namePlaceholder")}
                className="h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grp-desc" className="text-xs font-medium text-foreground/80">
                {t("groups.descLabel")}
              </Label>
              <Input
                id="grp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("groups.descPlaceholder")}
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!name.trim() || busy}>
              {t("groups.createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
