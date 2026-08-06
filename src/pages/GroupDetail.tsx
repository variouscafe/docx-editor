import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getGroup,
  addMember,
  updateMemberRole,
  removeMember,
  revokeInvitation,
  updateGroup,
  deleteGroup,
} from "@/api/groups";
import { roleBadge } from "./Groups";
import type {
  GroupDetailResponse,
  GroupMember,
  InviteRole,
} from "@shared/groups";

const ROLE_LABEL: Record<InviteRole, string> = { admin: "관리자", member: "멤버" };

export default function GroupDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<GroupDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 멤버 추가 폼
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");

  // 설정 다이얼로그
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // 삭제 다이얼로그
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getGroup(id));
    } catch {
      toast.error("그룹을 열 수 없어요");
      navigate("/groups");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch {
      toast.error("처리 중 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  const group = data?.group;
  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];
  const myRole = group?.myRole;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const handleAdd = () =>
    run(async () => {
      if (!email.trim()) return;
      const res = await addMember(id, { email: email.trim(), role: inviteRole });
      setEmail("");
      if (res.member) toast.success("멤버를 추가했어요");
      else if (res.invitation) toast.success("초대를 보냈어요 — 상대가 로그인하면 자동 참여됩니다");
    });

  const handleRole = (m: GroupMember, role: InviteRole) =>
    run(async () => {
      await updateMemberRole(id, m.userId, { role });
      toast.success(`${ROLE_LABEL[role]}로 변경했어요`);
    });

  const handleRemove = (m: GroupMember) =>
    run(async () => {
      await removeMember(id, m.userId);
      toast.success(m.isMe ? "그룹에서 탈퇴했어요" : "멤버를 제거했어요");
      if (m.isMe) navigate("/groups");
    });

  const handleRevoke = (invId: string) =>
    run(async () => {
      await revokeInvitation(id, invId);
      toast.success("초대를 취소했어요");
    });

  const openSettings = () => {
    if (!group) return;
    setEditName(group.name);
    setEditDesc(group.description ?? "");
    setSettingsOpen(true);
  };
  const handleSaveSettings = async () => {
    if (busy || !group) return;
    setBusy(true);
    try {
      await updateGroup(id, { name: editName.trim() || group.name, description: editDesc.trim() || null });
      setSettingsOpen(false);
      toast.success("저장했어요");
      await load();
    } catch {
      toast.error("저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteGroup(id);
      toast.success("그룹을 삭제했어요");
      navigate("/groups");
    } catch {
      toast.error("삭제에 실패했어요");
      setBusy(false);
    }
  };

  if (loading || !group) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-8 sm:px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  const myBadge = roleBadge(group.myRole);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate("/groups")}>
        <ArrowLeft /> 그룹 목록
      </Button>

      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{group.name}</h2>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] ${myBadge.cls}`}
            >
              {myBadge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.description || `멤버 ${group.memberCount}명`}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={openSettings}>
            <Settings /> 정보 수정
          </Button>
        )}
      </div>

      {/* 멤버 */}
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground/80">멤버 ({members.length})</h3>
        <ul className="divide-y rounded-lg border bg-card">
          {members.map((m) => {
            const b = roleBadge(m.role);
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.name || "(이름 없음)"}</span>
                    {m.isMe && <span className="text-[11px] text-muted-foreground">나</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] ${b.cls}`}
                >
                  {b.label}
                </span>
                {m.isMe ? (
                  m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRemove(m)}
                      disabled={busy}
                    >
                      <LogOut /> 탈퇴
                    </Button>
                  )
                ) : canManage ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" title="더 보기">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={m.role === "admin"}
                        onClick={() => void handleRole(m, "admin")}
                      >
                        관리자로 변경
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={m.role === "member"}
                        onClick={() => void handleRole(m, "member")}
                      >
                        멤버로 변경
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void handleRemove(m)}
                      >
                        <Trash2 /> 그룹에서 제거
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 초대/추가 (manager) */}
      {canManage && (
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground/80">멤버 추가</h3>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              className="h-9 min-w-[180px] flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InviteRole)}>
              <SelectTrigger className="h-9 w-[110px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">멤버</SelectItem>
                <SelectItem value="admin">관리자</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void handleAdd()} disabled={busy || !email.trim()}>
              <Plus /> 추가
            </Button>
          </div>

          {invitations.length > 0 && (
            <>
              <h4 className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">
                초대 대기 ({invitations.length})
              </h4>
              <ul className="divide-y rounded-lg border bg-card">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm">{inv.email}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {ROLE_LABEL[inv.role]} 대기중
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRevoke(inv.id)}
                      disabled={busy}
                    >
                      취소
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 그룹 삭제 (owner) */}
      {isOwner && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-destructive">그룹 삭제</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                그룹의 멤버·초대·공유가 모두 제거됩니다. 공유된 템플릿은 작성자의 비공개로 돌아갑니다.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={busy}>
              <Trash2 /> 삭제
            </Button>
          </div>
        </section>
      )}

      {/* 설정 다이얼로그 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 정보 수정</DialogTitle>
            <DialogDescription>그룹 이름과 설명을 변경합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">이름</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">설명</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void handleSaveSettings()} disabled={busy}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>그룹을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 멤버·초대·보고서 공유가 제거되고, 공유된 템플릿은 비공개로 전환됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
