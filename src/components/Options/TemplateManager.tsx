import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Copy,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Globe,
  Lock,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { DocxOptions } from "@shared/options";
import { normalizeOptions } from "@shared/options";
import { BUILTIN_TEMPLATES } from "@shared/presets";
import type { ReportTemplateRow } from "@shared/report";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
} from "@/api/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface TemplateManagerProps {
  options: DocxOptions;
  templateId: string | null;
  /** 템플릿 선택/저장/복제/삭제 시 보고서 options 와 templateId 를 갱신(재스냅샷). */
  onApply: (options: DocxOptions, templateId: string | null) => void;
}

/** 중첩 객체 동등 비교(키 순서 무시). DocxOptions dirty 판정용. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return (a as unknown[]).every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

const clone = (o: DocxOptions): DocxOptions => JSON.parse(JSON.stringify(o));

type NameDialog = { mode: "create" | "rename"; name: string };

/** 우측 패널 템플릿 관리 — 선택 · 저장(갱신) · 다른 이름으로 저장 · 복제 · 삭제 · 공개/비공개 · 기본 지정. */
export default function TemplateManager({ options, templateId, onApply }: TemplateManagerProps) {
  const [userTemplates, setUserTemplates] = useState<ReportTemplateRow[]>([]);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUserTemplates(await listTemplates());
    } catch {
      /* ignore — 권한/네트워크 오류 시 정적 목록만 유지 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 현재 선택 분해
  const builtinSel = BUILTIN_TEMPLATES.find((b) => b.id === templateId);
  const userSel = userTemplates.find((u) => u.id === templateId);
  const sel = builtinSel ?? userSel;
  const isBound = !!sel;
  const isBuiltin = !!builtinSel;
  const isOwner = !!userSel?.isOwner;
  const isOthersPublic = !!userSel && !userSel.isOwner;
  const isDeleted = !!templateId && !sel;
  // 비교 기준도 정규화(구 템플릿은 새 필드가 없어 항상 dirty 로 오인되는 것 방지).
  const selOptions = sel ? normalizeOptions(sel.options) : undefined;
  const dirty = isBound && !!selOptions && !deepEqual(options, selOptions);
  const isDefault = !!userSel?.isDefault;
  const visibility = userSel?.visibility ?? "public";

  const myTemplates = userTemplates.filter((t) => t.isOwner);
  const sharedTemplates = userTemplates.filter((t) => !t.isOwner);

  const handleChange = (id: string) => {
    if (!id || id === "current") {
      onApply(options, null);
      return;
    }
    const t = BUILTIN_TEMPLATES.find((b) => b.id === id) ?? userTemplates.find((u) => u.id === id);
    if (t) onApply(clone(t.options), t.id);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      console.error("[template action failed]", e);
      toast.error("처리 중 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () =>
    run(async () => {
      if (!templateId || !isOwner) return;
      await updateTemplate(templateId, { options });
      toast.success("템플릿에 저장했어요");
    });

  const openCreate = () =>
    setNameDialog({
      mode: "create",
      name: sel ? `${sel.name} 사본` : "내 템플릿",
    });
  const openRename = () => sel && setNameDialog({ mode: "rename", name: sel.name });

  const confirmName = () =>
    run(async () => {
      if (!nameDialog || !nameDialog.name.trim()) return;
      const name = nameDialog.name.trim();
      if (nameDialog.mode === "create") {
        const row = await createTemplate({ name, options, visibility: "private" });
        onApply(options, row.id);
        toast.success("새 템플릿으로 저장했어요");
      } else if (templateId) {
        await updateTemplate(templateId, { name });
        toast.success("이름을 변경했어요");
      }
      setNameDialog(null);
    });

  const handleDuplicate = () =>
    run(async () => {
      if (!templateId) return;
      const row = await duplicateTemplate(templateId);
      onApply(clone(row.options), row.id);
      toast.success("복제했어요");
    });

  const handleToggleVisibility = () =>
    run(async () => {
      if (!templateId || !isOwner) return;
      const next = visibility === "public" ? "private" : "public";
      await updateTemplate(templateId, { visibility: next });
      toast.success(next === "public" ? "공개로 전환했어요" : "비공개로 전환했어요");
    });

  const handleToggleDefault = () =>
    run(async () => {
      if (!templateId || !isOwner) return;
      await updateTemplate(templateId, { isDefault: !isDefault });
      toast.success(isDefault ? "기본 템플릿을 해제했어요" : "기본 템플릿으로 지정했어요");
    });

  const confirmDelete = () =>
    run(async () => {
      if (!templateId) return;
      await deleteTemplate(templateId);
      onApply(options, null);
      toast.success("템플릿을 삭제했어요");
      setDeleteOpen(false);
    });

  const showSaveButton = isOwner && isBound && !isBuiltin;
  // 비소유자(빌트인/타인 공유)는 DB 행이 없거나 편집 권한이 없으므로, 현재 옵션으로 새 템플릿을 만드는 것만 허용.
  const showCreateButton = !isBound || isDeleted || isBuiltin || isOthersPublic;
  const showMenu = isOwner && isBound && !isBuiltin;

  return (
    <div className="space-y-2 border-b bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">템플릿</span>
        <Select value={isDeleted ? "" : templateId ?? "current"} onValueChange={handleChange}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-sm">
            <SelectValue placeholder="(삭제된 양식)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">(현재 옵션)</SelectItem>
            <SelectGroup>
              <SelectLabel>빌트인</SelectLabel>
              {BUILTIN_TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {myTemplates.length > 0 && (
              <SelectGroup>
                <SelectLabel>내 템플릿</SelectLabel>
                {myTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " ★" : ""}
                    {t.visibility === "public" ? " 🔗" : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sharedTemplates.length > 0 && (
              <SelectGroup>
                <SelectLabel>공유 템플릿</SelectLabel>
                {sharedTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" title="더 보기">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openCreate}>
                <FilePlus2 /> 다른 이름으로 저장
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openRename}>
                <Pencil /> 이름 편집
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy /> 복제
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleToggleVisibility}>
                {visibility === "public" ? <Lock /> : <Globe />}
                {visibility === "public" ? "비공개로 전환" : "공개로 전환"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleDefault}>
                <Star /> {isDefault ? "기본 템플릿 해제" : "기본 템플릿으로 지정"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 상태 표시 */}
      {isDeleted ? (
        <p className="text-[11px] text-muted-foreground">(삭제된 양식) — 현재 옵션은 유지됩니다.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {dirty && <span className="text-amber-600 dark:text-amber-400">수정됨 · 저장 필요</span>}
          {isOwner && isDefault && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              기본 템플릿
            </span>
          )}
          {isOthersPublic && (
            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
              공유 (읽기 전용)
            </span>
          )}
        </div>
      )}

      {/* 주요 액션 */}
      <div className="flex flex-wrap gap-1.5">
        {showSaveButton && (
          <Button size="sm" disabled={!dirty || busy} onClick={() => void handleSave()}>
            <Save /> 저장
          </Button>
        )}
        {showCreateButton && (
          <Button size="sm" variant="outline" onClick={openCreate} disabled={busy}>
            <FilePlus2 /> 새 템플릿으로 저장
          </Button>
        )}
      </div>

      {/* 이름 입력 다이얼로그 (새 템플릿 저장 / 이름 편집) */}
      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === "rename" ? "템플릿 이름 편집" : "새 템플릿으로 저장"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDialog?.name ?? ""}
            onChange={(e) => setNameDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            placeholder="템플릿 이름"
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmName();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>
              취소
            </Button>
            <Button
              onClick={() => void confirmName()}
              disabled={!nameDialog?.name.trim() || busy}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 템플릿으로 만든 기존 보고서는 영향을 받지 않습니다(각 보고서는 자체 양식을 저장함).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
