import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

/** 역할 → 라벨/스타일(문서 내 pill 패턴 재사용). */
export function roleBadge(role: GroupRole): { label: string; cls: string } {
  switch (role) {
    case "owner":
      return { label: "소유자", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "admin":
      return { label: "관리자", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
    default:
      return { label: "멤버", cls: "bg-muted text-muted-foreground" };
  }
}

export default function Groups() {
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
      toast.success("그룹을 만들었어요");
      setOpen(false);
      setName("");
      setDescription("");
      navigate(`/groups/${g.id}`);
    } catch {
      toast.error("그룹 생성에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">그룹</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus /> 그룹 만들기
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
          <p className="text-sm text-muted-foreground">
            참여한 그룹이 없습니다. 그룹을 만들어 팀원과 템플릿·보고서를 공유해보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((g) => {
            const badge = roleBadge(g.myRole);
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
                      <div className="text-xs text-muted-foreground">멤버 {g.memberCount}명</div>
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
            <DialogTitle>그룹 만들기</DialogTitle>
            <DialogDescription>
              그룹원끼리 템플릿과 보고서를 공유할 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grp-name" className="text-xs font-medium text-foreground/80">
                이름
              </Label>
              <Input
                id="grp-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 마케팅팀"
                className="h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grp-desc" className="text-xs font-medium text-foreground/80">
                설명 (선택)
              </Label>
              <Input
                id="grp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="그룹 설명"
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!name.trim() || busy}>
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
