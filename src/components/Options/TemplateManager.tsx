import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Globe,
  Lock,
  Star,
  Trash2,
  Layers,
  Link,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { DocxOptions } from "@shared/options";
import { normalizeOptions } from "@shared/options";
import { BUILTIN_TEMPLATES } from "@shared/presets";
import type { ReportTemplateRow, TemplateVisibility } from "@shared/report";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/api/templates";
import { listGroups } from "@/api/groups";
import type { Group } from "@shared/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
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
import { SegmentedField, SelectField } from "./fields";

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

type NameDialog = {
  mode: "create" | "rename";
  name: string;
  visibility: TemplateVisibility;
  groupId: string; // visibility='group' 일 때 대상 그룹 id
};

/** 우측 패널 템플릿 관리 — 선택 · 저장(갱신) · 다른 이름으로 저장 · 복제 · 삭제 · 공개범위 · 기본 지정. */
export default function TemplateManager({ options, templateId, onApply }: TemplateManagerProps) {
  const { t } = useTranslation();
  const [userTemplates, setUserTemplates] = useState<ReportTemplateRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 공유 에디터 표시용 로컬 가시성(실제 값은 visibility 로 동기화).
  const [effVis, setEffVis] = useState<TemplateVisibility>("private");

  const load = useCallback(async () => {
    try {
      const [tpls, grps] = await Promise.all([listTemplates(), listGroups()]);
      setUserTemplates(tpls);
      setGroups(grps);
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
  const isOthersShared = !!userSel && !userSel.isOwner;
  const isOthersGroup = isOthersShared && userSel.visibility === "group";
  const isDeleted = !!templateId && !sel;
  // 비교 기준도 정규화(구 템플릿은 새 필드가 없어 항상 dirty 로 오인되는 것 방지).
  const selOptions = sel ? normalizeOptions(sel.options) : undefined;
  const dirty = isBound && !!selOptions && !deepEqual(options, selOptions);
  const isDefault = !!userSel?.isDefault;
  const visibility = userSel?.visibility ?? "private";
  const currentGroupId = userSel?.groupId ?? null;

  useEffect(() => {
    setEffVis(visibility);
  }, [visibility]);

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
      toast.error(t("templates.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  // 템플릿 자동저장 — 소유·연결·빌트인 아닌 템플릿의 옵션이 바뀌면 1.5초 후 갱신(저장 버튼 없음).
  // 저장 성공 시 로컬 템플릿 options 를 낙관 반영 → "수정됨" 배지 해제(추가 GET 없음).
  // 다른 액션(이름/공개범위/삭제) 진행 중(busy)엔 건너뛰어 PATCH 경쟁을 회피.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!templateId || !isOwner || !isBound || isBuiltin || !dirty || busy) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await updateTemplate(templateId, { options });
          setUserTemplates((prev) =>
            prev.map((tpl) => (tpl.id === templateId ? { ...tpl, options } : tpl)),
          );
        } catch (e) {
          console.error("[template autosave failed]", e);
        }
      })();
    }, 1500);
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
    };
  }, [templateId, isOwner, isBound, isBuiltin, dirty, busy, options]);

  const openCreate = () =>
    setNameDialog({
      mode: "create",
      name: sel ? t("templates.copyName", { name: sel.name }) : t("templates.myTemplate"),
      visibility: "private",
      groupId: "",
    });
  const openRename = () => sel && setNameDialog({ mode: "rename", name: sel.name, visibility, groupId: "" });

  const confirmName = () =>
    run(async () => {
      if (!nameDialog || !nameDialog.name.trim()) return;
      const name = nameDialog.name.trim();
      if (nameDialog.mode === "create") {
        const vis = nameDialog.visibility;
        if (vis === "group" && !nameDialog.groupId) {
          toast.error(t("templates.pickGroup"));
          return;
        }
        const row = await createTemplate({
          name,
          options,
          visibility: vis,
          groupId: vis === "group" ? nameDialog.groupId : null,
        });
        onApply(options, row.id);
        toast.success(t("templates.savedNew"));
      } else if (templateId) {
        await updateTemplate(templateId, { name });
        toast.success(t("templates.renamed"));
      }
      setNameDialog(null);
    });

  /** 가시성 변경(인라인 에디터). private/public 은 즉시, group 은 그룹 선택 시 확정. */
  const handleVisibility = (vis: TemplateVisibility, gid?: string | null) =>
    run(async () => {
      if (!templateId || !isOwner) return;
      if (vis === "group") {
        if (!gid) return;
        await updateTemplate(templateId, { visibility: "group", groupId: gid });
        toast.success(t("templates.groupSharedToast"));
      } else {
        await updateTemplate(templateId, { visibility: vis });
        toast.success(vis === "public" ? t("templates.toPublic") : t("templates.toPrivate"));
      }
    });

  const onVisSegment = (v: TemplateVisibility) => {
    setEffVis(v);
    if (v !== "group") void handleVisibility(v);
  };

  const handleToggleDefault = () =>
    run(async () => {
      if (!templateId || !isOwner) return;
      await updateTemplate(templateId, { isDefault: !isDefault });
      toast.success(isDefault ? t("templates.unsetDefaultToast") : t("templates.setAsDefault"));
    });

  const confirmDelete = () =>
    run(async () => {
      if (!templateId) return;
      await deleteTemplate(templateId);
      onApply(options, null);
      toast.success(t("templates.deleted"));
      setDeleteOpen(false);
    });

  // 비소유자(빌트인/타인 공유)는 DB 행이 없거나 편집 권한이 없으므로, 현재 옵션으로 새 템플릿을 만드는 것만 허용.
  const showCreateButton = !isBound || isDeleted || isBuiltin || isOthersShared;
  const showMenu = isOwner && isBound && !isBuiltin;
  const showVisibilityEditor = showMenu;

  const isRename = nameDialog?.mode === "rename";

  return (
    <div className="space-y-3 border-b bg-muted/30 px-4 py-3.5">
      {/* 현재 양식 선택 */}
      <div className="flex items-center gap-2">
        <Layers className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-medium text-foreground/80">{t("templates.current")}</span>
        <Select value={isDeleted ? "" : templateId ?? "current"} onValueChange={handleChange}>
          <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
            <SelectValue placeholder={t("templates.deletedPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{t("templates.currentOption")}</SelectItem>
            <SelectGroup>
              <SelectLabel>{t("templates.builtin")}</SelectLabel>
              {BUILTIN_TEMPLATES.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {myTemplates.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("templates.mine")}</SelectLabel>
                {myTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.isDefault ? " ★" : ""}
                    {tpl.visibility === "public" ? " 🔗" : ""}
                    {tpl.visibility === "group" ? ` · ${tpl.groupName ?? t("templates.group")}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {sharedTemplates.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("templates.shared")}</SelectLabel>
                {sharedTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.visibility === "group" ? ` · ${tpl.groupName ?? t("templates.group")}` : " 🔗"}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0" title={t("templates.more")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openCreate}>
                <FilePlus2 /> {t("templates.saveAs")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openRename}>
                <Pencil /> {t("templates.rename")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleToggleDefault}>
                <Star /> {isDefault ? t("templates.unsetDefault") : t("templates.setDefault")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 상태 표시 (pill 배지) */}
      {isDeleted ? (
        <p className="text-[11px] text-muted-foreground">{t("templates.deletedHint")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
              <span className="size-1.5 rounded-full bg-amber-500" />
              {t("templates.modified")}
            </span>
          )}
          {isOwner && isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
              <Star className="size-3" /> {t("templates.defaultBadge")}
            </span>
          )}
          {isOthersGroup && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-300">
              <Users className="size-3" /> {t("templates.groupShared", { group: userSel?.groupName ?? t("templates.group") })}
            </span>
          )}
          {isOthersShared && !isOthersGroup && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
              <Link className="size-3" /> {t("templates.sharedBadge")}
            </span>
          )}
        </div>
      )}

      {/* 공유 범위 에디터 (소유 템플릿) */}
      {showVisibilityEditor && (
        <div className="space-y-2">
          <SegmentedField<TemplateVisibility>
            value={effVis}
            onChange={onVisSegment}
            options={[
              { label: t("templates.visibility.private"), value: "private", icon: <Lock className="size-3.5" /> },
              { label: t("templates.visibility.public"), value: "public", icon: <Globe className="size-3.5" /> },
              { label: t("templates.visibility.group"), value: "group", icon: <Users className="size-3.5" /> },
            ]}
          />
          {effVis === "group" &&
            (groups.length > 0 ? (
              <SelectField
                label={t("templates.shareGroup")}
                value={currentGroupId ?? ""}
                onChange={(v) => void handleVisibility("group", v)}
                options={groups.map((g) => ({ label: g.name, value: g.id }))}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("templates.noGroupJoin")}</p>
            ))}
        </div>
      )}

      {/* 주요 액션 — 템플릿 저장은 자동(옵션 변경 시 1.5초 후). 남은 액션은 새 템플릿 저장뿐. */}
      <div className="grid grid-cols-2 gap-1.5">
        {showCreateButton && (
          <Button
            size="sm"
            variant="outline"
            onClick={openCreate}
            disabled={busy}
            className="col-span-2"
          >
            <FilePlus2 /> {t("templates.saveNew")}
          </Button>
        )}
      </div>

      {/* 이름 입력 다이얼로그 (새 템플릿 저장 / 이름 편집) */}
      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRename ? t("templates.renameTitle") : t("templates.nameTitle")}</DialogTitle>
            <DialogDescription>
              {isRename ? t("templates.renameDesc") : t("templates.nameDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs font-medium text-foreground/80">
                {t("templates.nameLabel")}
              </Label>
              <Input
                id="tpl-name"
                autoFocus
                value={nameDialog?.name ?? ""}
                onChange={(e) => setNameDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                placeholder={t("templates.namePlaceholder")}
                className="h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmName();
                }}
              />
            </div>
            {nameDialog?.mode === "create" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">{t("templates.visibilityLabel")}</Label>
                <SegmentedField<TemplateVisibility>
                  value={nameDialog.visibility}
                  onChange={(v) => setNameDialog((d) => (d ? { ...d, visibility: v } : d))}
                  options={[
                    { label: t("templates.visibility.private"), value: "private", icon: <Lock className="size-3.5" /> },
                    { label: t("templates.visibility.public"), value: "public", icon: <Globe className="size-3.5" /> },
                    { label: t("templates.visibility.group"), value: "group", icon: <Users className="size-3.5" /> },
                  ]}
                />
                {nameDialog.visibility === "group" &&
                  (groups.length > 0 ? (
                    <SelectField
                      label={t("templates.shareGroup")}
                      value={nameDialog.groupId}
                      onChange={(v) => setNameDialog((d) => (d ? { ...d, groupId: v } : d))}
                      options={groups.map((g) => ({ label: g.name, value: g.id }))}
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">{t("templates.noGroupJoin")}</p>
                  ))}
                <p className="text-[11px] text-muted-foreground">
                  {nameDialog.visibility === "public"
                    ? t("templates.visDesc.public")
                    : nameDialog.visibility === "group"
                      ? t("templates.visDesc.group")
                      : t("templates.visDesc.private")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void confirmName()} disabled={!nameDialog?.name.trim() || busy}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("templates.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("templates.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
