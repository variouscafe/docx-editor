import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, SlidersHorizontal, Loader2, Share2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/Layout/ThemeToggle";
import { toast } from "sonner";
import type { DocxOptions } from "@shared/options";
import { defaultOptions, normalizeOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import type { Report, ReportPermission } from "@shared/report";
import HeadingSymbolSelector from "@/components/Editor/HeadingSymbolSelector";
import AnnotationModeSelector from "@/components/Editor/AnnotationModeSelector";
import OptionsContent from "@/components/Options/OptionsContent";
import DocxPreview from "@/components/Preview/DocxPreview";
import DocxExporter from "@/components/Export/DocxExporter";
import { ReportShareDialog } from "@/components/Share/ReportShareDialog";
import { VersionHistory } from "@/components/VersionHistory";
import {
  getReport,
  createReport,
  updateReport,
  exportReport,
} from "@/api/reports";
import { getDefaultTemplate } from "@/api/templates";
import { refreshAccessToken } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { decodeJwt } from "@/lib/jwt";
import { jsonToMarkdown } from "@/utils/jsonToMarkdown";
import { useDraftBackup } from "@/hooks/useDraftBackup";

const STARTER_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "title",
      attrs: { "data-title": "true" },
      content: [{ type: "text", text: "제목" }],
    },
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "첫 번째 헤딩" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "여기에 본문을 작성하세요." }],
    },
  ],
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 저장 실패 에러 메시지 — HttpError.status 가 있으면 코드 포함. */
function saveErrMsg(e: unknown): string {
  const status = e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
  return `저장 실패${status ? ` (${status})` : ""}`;
}

export default function ReportEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [title, setTitle] = useState("제목 없음");
  const [editorJson, setEditorJson] = useState<JSONContent>(STARTER_DOC);
  const [options, setOptions] = useState<DocxOptions>(defaultOptions);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // 저장/생성 중복 실행(수동 탭 ↔ 1.5s 자동저장 경쟁) 방지용 동기 플래그.
  // disabled 대신 사용 → 버튼은 항상 탭 가능하고 스피너로 진행을 알림.
  const savingRef = useRef(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 자동저장 백오프 재시도 트리거(실패 시각). saveError 문자열이 동일해도 매 실패마다 갱신.
  const [saveErrorAt, setSaveErrorAt] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  // beforeunload 에서 최신 dirty 를 읽기 위한 ref.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  // 연속 저장 실패 횟수 → 백오프 지연 계산. 성공 시 0 으로 리셋.
  const retryCountRef = useRef(0);
  const [permission, setPermission] = useState<ReportPermission>("owner");
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // 보고서 로드(기존). 신규면 그대로 스타터.
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getReport(id)
      .then((r) => {
        if (!active) return;
        setTitle(r.title);
        setEditorJson(r.content);
        setOptions(normalizeOptions(r.templateOptions));
        setTemplateId(r.templateId);
        setPermission(r.permission);
        setOwnerName(r.ownerName ?? null);
        setGroupName(r.groupName ?? null);
        setDirty(false);
        setLoading(false);
      })
      .catch(() => navigate("/reports", { replace: true }));
    return () => {
      active = false;
    };
  }, [id, navigate]);

  // 신규 보고서 — 사용자 기본 템플릿으로 초기화. 미지정(204)이면 defaultOptions(빌트인 기본 양식) 유지.
  useEffect(() => {
    if (id) return;
    let active = true;
    getDefaultTemplate()
      .then((t) => {
        if (active && t) {
          setOptions(normalizeOptions(t.options));
          setTemplateId(t.id);
        }
      })
      .catch(() => {
        /* 기본 템플릿 로드 실패 시 defaultOptions 유지 */
      });
    return () => {
      active = false;
    };
  }, [id]);

  const onContentChange = useCallback((json: JSONContent) => {
    setEditorJson(json);
    setDirty(true);
  }, []);

  const onOptionsChange = useCallback((o: DocxOptions) => {
    setOptions(o);
    setDirty(true);
  }, []);

  // 템플릿 선택/저장/복제/삭제 시 options(재정규화)·templateId 갱신.
  const handleApply = useCallback((opts: DocxOptions, tid: string | null) => {
    setOptions(normalizeOptions(opts));
    setTemplateId(tid);
    setDirty(true);
  }, []);

  // 공유받은 보고서(읽기 전용) — 옵션·템플릿·내용 변경 무시(저장·편집 불가, 내보내기만 허용).
  const isReadOnly = permission === "view";
  const guardedOptionsChange = isReadOnly ? () => {} : onOptionsChange;
  const guardedApply = isReadOnly ? (() => {}) : handleApply;

  // 리비전 되돌리기 후 — 해당 버전 content/options/title 로 교체.
  const handleRestored = useCallback((r: Report) => {
    setTitle(r.title);
    setEditorJson(r.content);
    setOptions(normalizeOptions(r.templateOptions));
    setTemplateId(r.templateId);
    setDirty(false);
  }, []);

  const buildBody = useCallback(
    () => ({
      title,
      content: editorJson,
      contentMd: jsonToMarkdown(editorJson),
      templateOptions: options,
      templateId,
    }),
    [title, editorJson, options, templateId]
  );

  // 저장 직전 액세스 토큰 만료(60s 이내) 선제 갱신 → 토큰 만료로 인한 401 저장 실패 방지.
  const ensureFreshToken = useCallback(async (): Promise<boolean> => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return false;
    try {
      const payload = decodeJwt(accessToken);
      if (typeof payload?.exp === "number" && payload.exp * 1000 < Date.now() + 60000) {
        return refreshAccessToken();
      }
    } catch {
      /* ignore */
    }
    return true;
  }, []);

  const save = useCallback(async (opts?: { manual?: boolean }) => {
    if (!id) return;
    // 저장/생성 중이면 무시(수동 탭과 자동저장 경쟁 시 중복 PATCH 방지).
    // 버튼은 비활성화하지 않아 탭이 항상 인식되고, 진행 중엔 스피너로 피드백.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await ensureFreshToken();
      await updateReport(id, buildBody());
      setDirty(false);
      setSavedAt(Date.now());
      setSaveError(null);
      setSaveErrorAt(null);
      retryCountRef.current = 0;
      if (opts?.manual) toast.success("저장됨");
    } catch (e) {
      console.error("[save failed]", e);
      setSaveError(saveErrMsg(e));
      setSaveErrorAt(Date.now());
      retryCountRef.current += 1;
      if (opts?.manual) toast.error(saveErrMsg(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [id, buildBody, ensureFreshToken]);

  // 신규 → 생성 후 라우트 이동. 기존 → 저장 후 id 반환.
  // 신규 생성 경로도 savingRef 로 중복 차단(연타 시 보고서 다중 생성 방지).
  const ensureId = useCallback(async (opts?: { manual?: boolean }): Promise<string | null> => {
    if (id) {
      await save(opts);
      return id;
    }
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      await ensureFreshToken();
      const created = await createReport(buildBody());
      setDirty(false);
      setSavedAt(Date.now());
      setSaveError(null);
      setSaveErrorAt(null);
      retryCountRef.current = 0;
      navigate(`/reports/${created.id}`, { replace: true });
      if (opts?.manual) toast.success("저장됨");
      return created.id;
    } catch (e) {
      console.error("[create failed]", e);
      setSaveError(saveErrMsg(e));
      setSaveErrorAt(Date.now());
      retryCountRef.current += 1;
      if (opts?.manual) toast.error(saveErrMsg(e));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [id, save, buildBody, navigate, ensureFreshToken]);

  // 1.5초 debounce 자동저장. 오프라인이면 보류(실패만 양산), 실패 후엔 지수 백오프(최대 30s) 재시도.
  useEffect(() => {
    if (isReadOnly || !dirty || !online) return;
    const delay = saveError
      ? Math.min(1500 * 2 ** Math.min(retryCountRef.current, 4), 30000)
      : 1500;
    const t = setTimeout(() => {
      if (id) void save();
      else void ensureId();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isReadOnly, dirty, online, saveError, saveErrorAt, title, editorJson, options, templateId, save, ensureId]);

  // 미저장 변경(dirty)이 있을 때 탭 닫기/새로고침 경고.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // 온라인/오프라인 전환 감지. 오프라인 → 자동저장 보류, 복귀 시 dirty 면 즉시 재시도.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      toast.success("온라인 연결 복구 — 저장을 재개합니다");
    };
    const goOffline = () => {
      setOnline(false);
      toast.warning("오프라인 — 변경 내용은 임시 저장됩니다");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const handleExport = useCallback(async () => {
    const rid = await ensureId();
    if (!rid) return;
    const blob = await exportReport(rid);
    downloadBlob(blob, `${(title || "document").slice(0, 80)}.docx`);
    toast.success("DOCX 내보내기 완료");
  }, [ensureId, title]);

  // 임시 저장 스냅샷(크래시/오프라인 대비) + 직전 세션 미저장 내용 복구.
  const draftKey = `docx-draft:${id ?? "new"}`;
  const draftValue = useMemo(
    () => ({ title, content: editorJson, templateOptions: options, templateId }),
    [title, editorJson, options, templateId],
  );
  const { draft, clear: clearDraft } = useDraftBackup(
    draftKey,
    draftValue,
    dirty && !isReadOnly,
    savedAt,
  );
  const restoreDraft = useCallback(() => {
    if (!draft) return;
    setTitle(draft.value.title);
    setEditorJson(draft.value.content);
    setOptions(normalizeOptions(draft.value.templateOptions));
    setTemplateId(draft.value.templateId);
    setDirty(true);
    clearDraft();
    toast.success("임시 내용을 복구했어요");
  }, [draft, clearDraft]);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex h-14 items-center gap-2 border-b bg-background px-4">
          <Skeleton className="size-8 rounded" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      </div>
    );
  }

  const statusText =
    !online && dirty
      ? "오프라인(임시 저장)"
      : saveError ?? (saving ? "저장 중…" : dirty ? "수정됨(저장 대기)" : savedAt ? "저장됨" : "");
  // 모바일 헤더는 폭이 좁아 저장 중/에러 상태만 컴팩트 노출(저장됨/대기는 버튼 상태로 충분).
  const mobileStatus = saveError ?? (saving ? "저장 중" : null);

  return (
    <div className="h-dvh flex flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/reports")}
          className="shrink-0"
          title="목록으로"
        >
          <ArrowLeft />
        </Button>
        <input
          value={title}
          readOnly={isReadOnly}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="flex-1 min-w-0 bg-transparent text-base lg:text-lg font-semibold outline-none border-b border-transparent focus:border-ring read-only:cursor-default"
        />
        {/* PC: 전체 상태 표시 */}
        <span className={`hidden lg:block text-xs w-28 text-right shrink-0 ${saveError ? "text-destructive" : "text-muted-foreground"}`}>{isReadOnly ? "읽기 전용" : statusText}</span>
        {/* 모바일: 저장 중/에러만 컴팩트 노출 */}
        {mobileStatus && (
          <span className={`lg:hidden text-xs shrink-0 ${saveError ? "text-destructive" : "text-muted-foreground"}`}>{mobileStatus}</span>
        )}
        {!isReadOnly && id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            className="shrink-0"
            title="공유"
          >
            <Share2 />
            <span className="hidden sm:inline">공유</span>
          </Button>
        )}
        {!isReadOnly && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void ensureId({ manual: true })}
            className="shrink-0"
            title="저장"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            <span className="hidden sm:inline">{saving ? "저장 중" : "저장"}</span>
          </Button>
        )}
        <DocxExporter onExport={() => void handleExport()} disabled={saving} />
        {!isReadOnly && <VersionHistory reportId={id} onRestored={handleRestored} />}
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOptionsOpen(true)}
          className="shrink-0 lg:hidden"
          title="옵션"
        >
          <SlidersHorizontal />
        </Button>
      </header>

      {isReadOnly && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          <span>공유됨 · 읽기 전용</span>
          {ownerName && <span>· 작성자 {ownerName}</span>}
          {groupName && <span>· {groupName}</span>}
        </div>
      )}

      {/* 직전 세션에서 저장 못 한 임시 내용 복구 — localStorage 스냅샷이 남아있을 때만. */}
      {!isReadOnly && draft && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>
            저장되지 않은 임시 내용이 있습니다(
            {draft.ts ? new Date(draft.ts).toLocaleTimeString() : ""}).
          </span>
          <button type="button" onClick={restoreDraft} className="font-semibold underline">
            복구
          </button>
          <button type="button" onClick={clearDraft} className="underline">
            삭제
          </button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col border-r">
          <div className="border-b bg-muted/40 overflow-x-auto">
            <HeadingSymbolSelector options={options} onOptionsChange={guardedOptionsChange} />
            <AnnotationModeSelector options={options} onOptionsChange={guardedOptionsChange} />
          </div>
          <DocxPreview
            json={editorJson}
            options={options}
            editable={!isReadOnly}
            onContentChange={onContentChange}
          />
        </div>
        {/* PC: 인라인 우측 옵션 패널 */}
        <aside className="hidden lg:flex lg:w-[560px] lg:shrink-0 flex-col overflow-hidden bg-card">
          <OptionsContent
            options={options}
            templateId={templateId}
            onApply={guardedApply}
            onOptionsChange={guardedOptionsChange}
          />
        </aside>

        {/* 모바일: Sheet 드로어(포커스트랩·본문 스크롤 잠금·슬라이드 애니메이션) */}
        <Sheet open={mobileOptionsOpen} onOpenChange={setMobileOptionsOpen}>
          <SheetContent side="right" className="w-full data-[side=right]:w-full gap-0 p-0">
            <SheetHeader className="flex-row items-center justify-between border-b px-3 py-2.5">
              <SheetTitle>옵션</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <OptionsContent
                options={options}
                templateId={templateId}
                onApply={guardedApply}
                onOptionsChange={guardedOptionsChange}
              />
            </div>
          </SheetContent>
        </Sheet>
      </main>

      {id && <ReportShareDialog reportId={id} open={shareOpen} onOpenChange={setShareOpen} />}
    </div>
  );
}
