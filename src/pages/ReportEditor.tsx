import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/Layout/ThemeToggle";
import { toast } from "sonner";
import type { DocxOptions } from "@shared/options";
import { defaultOptions, normalizeOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import type { Report } from "@shared/report";
import HeadingSymbolSelector from "@/components/Editor/HeadingSymbolSelector";
import AnnotationModeSelector from "@/components/Editor/AnnotationModeSelector";
import TemplateManager from "@/components/Options/TemplateManager";
import DocxPreview from "@/components/Preview/DocxPreview";
import OptionsPanel from "@/components/Options/OptionsPanel";
import DocxExporter from "@/components/Export/DocxExporter";
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
      if (opts?.manual) toast.success("저장됨");
    } catch (e) {
      console.error("[save failed]", e);
      setSaveError(saveErrMsg(e));
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
      navigate(`/reports/${created.id}`, { replace: true });
      if (opts?.manual) toast.success("저장됨");
      return created.id;
    } catch (e) {
      console.error("[create failed]", e);
      setSaveError(saveErrMsg(e));
      if (opts?.manual) toast.error(saveErrMsg(e));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [id, save, buildBody, navigate, ensureFreshToken]);

  // 1.5초 debounce 자동저장. 기존(id 있) → PATCH, 신규(id 없) → createReport 로 id 확보 후 라우트 전환.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      if (id) void save();
      else void ensureId();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dirty, title, editorJson, options, templateId, save, ensureId]);

  const handleExport = useCallback(async () => {
    const rid = await ensureId();
    if (!rid) return;
    const blob = await exportReport(rid);
    downloadBlob(blob, `${(title || "document").slice(0, 80)}.docx`);
    toast.success("DOCX 내보내기 완료");
  }, [ensureId, title]);

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

  const statusText = saveError ?? (saving ? "저장 중…" : dirty ? "수정됨(저장 대기)" : savedAt ? "저장됨" : "");
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
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="flex-1 min-w-0 bg-transparent text-base lg:text-lg font-semibold outline-none border-b border-transparent focus:border-ring"
        />
        {/* PC: 전체 상태 표시 */}
        <span className={`hidden lg:block text-xs w-28 text-right shrink-0 ${saveError ? "text-destructive" : "text-muted-foreground"}`}>{statusText}</span>
        {/* 모바일: 저장 중/에러만 컴팩트 노출 */}
        {mobileStatus && (
          <span className={`lg:hidden text-xs shrink-0 ${saveError ? "text-destructive" : "text-muted-foreground"}`}>{mobileStatus}</span>
        )}
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
        <DocxExporter onExport={() => void handleExport()} disabled={saving} />
        <VersionHistory reportId={id} onRestored={handleRestored} />
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

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col border-r">
          <div className="border-b bg-muted/40 overflow-x-auto">
            <HeadingSymbolSelector options={options} onOptionsChange={onOptionsChange} />
            <AnnotationModeSelector options={options} onOptionsChange={onOptionsChange} />
          </div>
          <DocxPreview
            json={editorJson}
            options={options}
            editable
            onContentChange={onContentChange}
          />
        </div>
        {/* Options: PC = 우측 고정 패널 / 모바일 = 슬라이드 드로어(단일 요소, CSS 전환) */}
        {mobileOptionsOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOptionsOpen(false)}
            aria-hidden="true"
          />
        )}
        <div
          className={[
            "flex flex-col bg-card overflow-hidden",
            // 모바일: 우측 슬라이드 드로어(닫힘 시 화면 밖).
            "fixed inset-y-0 right-0 z-50 w-[88%] max-w-sm transition-transform duration-200 shadow-xl",
            mobileOptionsOpen ? "translate-x-0" : "translate-x-full",
            // PC: 인라인 고정 패널(transform 무시, 항상 노출).
            "lg:static lg:translate-x-0 lg:w-[360px] lg:max-w-none lg:shadow-none lg:z-auto lg:flex-shrink-0",
          ].join(" ")}
        >
          <div className="lg:hidden flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">옵션</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOptionsOpen(false)}
              title="닫기"
            >
              <X />
            </Button>
          </div>
          <div className="flex flex-1 min-h-0 flex-col">
            <TemplateManager
              options={options}
              templateId={templateId}
              onApply={(opts, tid) => {
                setOptions(normalizeOptions(opts));
                setTemplateId(tid);
                setDirty(true);
              }}
            />
            <div className="min-h-0 flex-1">
              <OptionsPanel options={options} onOptionsChange={onOptionsChange} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
