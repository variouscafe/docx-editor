import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, Save, SlidersHorizontal, Loader2, MoreHorizontal, History, Eye, Globe, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/Layout/UserMenu";
import { toast } from "sonner";
import type { DocxOptions } from "@shared/options";
import { defaultOptions, normalizeOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import type { Report, ReportPermission } from "@shared/report";
import OptionsContent from "@/components/Options/OptionsContent";
import DocxPreview from "@/components/Preview/DocxPreview";
import { ReportShareDialog } from "@/components/Share/ReportShareDialog";
import { PublicShareDialog } from "@/components/Share/PublicShareDialog";
import { VersionHistory } from "@/components/VersionHistory";
import {
  getReport,
  createReport,
  updateReport,
  exportReport,
} from "@/api/reports";
import { getDefaultTemplate } from "@/api/templates";
import { refreshAccessToken } from "@/api/client";
import { waitForPendingImageUploads } from "@/api/uploads";
import { HttpError } from "@/lib/http-client";
import { useAuthStore } from "@/store/auth";
import { decodeJwt } from "@/lib/jwt";
import { jsonToMarkdown } from "@/utils/jsonToMarkdown";
import { useDraftBackup } from "@/hooks/useDraftBackup";

/** 신규 보고서 스타터 문서 — UI 언어로 생성. */
function starterDoc(t: TFunction): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "title",
        attrs: { "data-title": "true" },
        content: [{ type: "text", text: t("starter.title") }],
      },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: t("starter.firstHeading") }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: t("starter.body") }],
      },
    ],
  };
}

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
function saveErrMsg(e: unknown, t: TFunction): string {
  const status = e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
  return status ? t("editor.saveFailedStatus", { status }) : t("editor.saveFailed");
}

/** blob: src 이미지 노드(업로드 미완료) 제거 — draft 복구 시 세션 종료로 죽은 URL 정리. */
function stripBlobImages(node: JSONContent): JSONContent {
  if (!node.content?.length) return node;
  let changed = false;
  const content: JSONContent[] = [];
  for (const child of node.content) {
    if (child.type === "image" && String(child.attrs?.src ?? "").startsWith("blob:")) {
      changed = true;
      continue;
    }
    const cleaned = stripBlobImages(child);
    if (cleaned !== child) changed = true;
    content.push(cleaned);
  }
  return changed ? { ...node, content } : node;
}

export default function ReportEditor() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [title, setTitle] = useState(t("editor.untitledTitle"));
  const [editorJson, setEditorJson] = useState<JSONContent>(() => starterDoc(t));
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
  // 저장 완료 판정용 최신 문서 상태 ref — PATCH 진행 중 입력이 있었는지 비교.
  // (setDirty(false) 가 저장 중 타이핑한 내용까지 "저장됨"으로 만드는 경쟁 방지)
  const latestDocRef = useRef<{ title: string; content: JSONContent; templateOptions: DocxOptions; templateId: string | null } | null>(null);
  latestDocRef.current = { title, content: editorJson, templateOptions: options, templateId };
  // 에디터 JSON 동기 미러 ref — buildBody 가 항상 최신 content 를 읽게 한다. setState 는
  // 재렌더 전 클로저에 옛 값을 남기므로, 이미지 업로드 src 교체 트랜잭션이 저장(PATCH)과
  // 경합할 때 blob: src 가 영속화되는 갭을 이 ref 로 막는다.
  const editorJsonRef = useRef(editorJson);
  const applyEditorJson = useCallback((json: JSONContent) => {
    editorJsonRef.current = json;
    setEditorJson(json);
  }, []);
  // 신규 생성 직후 라우트 이동된 id 는 서버 재취득 스킵 — 생성 요청 중 입력한 내용 보존.
  const createdIdRef = useRef<string | null>(null);
  // 연속 저장 실패 횟수 → 백오프 지연 계산. 성공 시 0 으로 리셋.
  const retryCountRef = useRef(0);
  // 마지막으로 알고 있는 서버 updatedAt(낙관적 동시성 제어용) — getReport/생성/PATCH 응답에서 갱신.
  const updatedAtRef = useRef<string | null>(null);
  // 409 conflict 발생 플래그 — 충돌 해결(새로고침/되돌리기) 전 자동저장 중단.
  const conflictRef = useRef(false);
  // 리비전 되돌리기 진행 중 — flush 완료~복원 커밋 사이 창구에 예약돼 있던 debounce
  // 자동저장이 발사돼 복원 직전 내용으로 덮어쓰는 경쟁 방지(대화상자 닫힘 시 해제).
  const restoringRef = useRef(false);
  // 충돌 토스트 중복 표시 방지(자동저장 재시도 없이 1회만 알림).
  const conflictToastRef = useRef(false);
  const [permission, setPermission] = useState<ReportPermission>("owner");
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [publicShareOpen, setPublicShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 보고서 로드(기존). 신규면 그대로 스타터.
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    // 이 세션에서 직접 생성한 보고서는 이미 상태에 있음 — 재취득하면 생성 중 입력이 유실됨.
    if (createdIdRef.current === id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getReport(id)
      .then((r) => {
        if (!active) return;
        setTitle(r.title);
        applyEditorJson(r.content);
        setOptions(normalizeOptions(r.templateOptions));
        setTemplateId(r.templateId);
        setPermission(r.permission);
        setOwnerName(r.ownerName ?? null);
        setGroupName(r.groupName ?? null);
        // 서버 상태 기준점 갱신(낙관적 동시성 제어) + 충돌 상태 해제.
        updatedAtRef.current = r.updatedAt;
        conflictRef.current = false;
        conflictToastRef.current = false;
        setDirty(false);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        // 무음 리다이렉트 금지 — 네트워크 오류/로그아웃/500 을 사용자가 알 수 있게.
        console.error("[load report failed]", e);
        toast.error(saveErrMsg(e, t));
        navigate("/reports", { replace: true });
      });
    return () => {
      active = false;
    };
  }, [id, navigate, t]);

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

  const onContentChange = useCallback(
    (json: JSONContent) => {
      applyEditorJson(json);
      setDirty(true);
    },
    [applyEditorJson]
  );

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
  // 되돌린 서버 상태가 새 기준점이므로 updatedAt 갱신 + 충돌 상태 해제(충돌 복구 경로).
  const handleRestored = useCallback((r: Report) => {
    setTitle(r.title);
    applyEditorJson(r.content);
    setOptions(normalizeOptions(r.templateOptions));
    setTemplateId(r.templateId);
    updatedAtRef.current = r.updatedAt;
    conflictRef.current = false;
    conflictToastRef.current = false;
    setSaveError(null);
    setDirty(false);
  }, [applyEditorJson]);

  const buildBody = useCallback(() => {
    // ref 에서 읽어 항상 최신 content 사용(재렌더 전 클로저 스테일 방지).
    const content = editorJsonRef.current;
    return {
      title,
      content,
      contentMd: jsonToMarkdown(content),
      templateOptions: options,
      templateId,
    };
  }, [title, options, templateId]);

  /** 저장 전송용 body — blob: 이미지 노드(업로드 미완료 잔존)를 제거하는 방어선.
   *  레지스트리 대기 후에도 blob: 노드가 남는 경로(에디터 파괴로 src 교체 누락 등)에서
   *  서버에 죽은 src 가 영속화되는 것을 막는다. 원본 body 는 그대로(dirty 판정 참조 비교용). */
  const buildSanitizedBody = useCallback((body: ReturnType<typeof buildBody>) => {
    const content = stripBlobImages(body.content);
    if (content === body.content) return body;
    return { ...body, content, contentMd: jsonToMarkdown(content) };
  }, []);

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

  // 저장 시작 시점 body 스냅샷이 아직 최신 상태인지(저장 중 새 편집이 없었는지) 참조 비교.
  const snapshotIsCurrent = useCallback(
    (body: { title: string; content: JSONContent; templateOptions: DocxOptions; templateId: string | null }) => {
      const cur = latestDocRef.current;
      return (
        !!cur &&
        cur.title === body.title &&
        cur.content === body.content &&
        cur.templateOptions === body.templateOptions &&
        cur.templateId === body.templateId
      );
    },
    []
  );

  // 진행 중 저장 Promise — 내보내기 등이 저장 완료를 기다릴 수 있게 추적.
  const savingPromiseRef = useRef<Promise<boolean> | null>(null);

  /** 1회 저장 실행(가드 포함). save() 가 flush 루프에서 호출. 성공 여부 반환. */
  const saveOnce = useCallback(
    async (targetId: string, opts?: { manual?: boolean }): Promise<boolean> => {
      // 저장/생성 중이면 무시(수동 탭과 자동저장 경쟁 시 중복 PATCH 방지).
      // 버튼은 비활성화하지 않아 탭이 항상 인식되고, 진행 중엔 스피너로 피드백.
      // 진행 중 저장이 있으면 그 결과를 그대로 반환(중복 실행하지 않음).
      if (savingRef.current) return (await savingPromiseRef.current) ?? true;
      savingRef.current = true;
      setSaving(true);
      const run = (async () => {
        try {
          // 토큰 갱신 실패(로그아웃됨)면 도단 401 왕복 없이 즉시 저장 실패로 처리.
          if (!(await ensureFreshToken())) throw new Error("Not signed in");
          // 진행 중 이미지 업로드가 끝날 때까지 대기 — blob: src 저장 영속화 방지.
          // 각 업로드 promise 는 src 교체 dispatch 까지 커버 → 대기 해제 시 ref 가 최신.
          await waitForPendingImageUploads();
          const body = buildSanitizedBody(buildBody());
          const saved = await updateReport(targetId, body, updatedAtRef.current ?? undefined);
          // 저장 중 새 편집이 있으면 dirty 유지 → debounce effect 가 재저장 예약.
          if (snapshotIsCurrent(body)) setDirty(false);
          updatedAtRef.current = saved.updatedAt;
          setSavedAt(Date.now());
          setSaveError(null);
          setSaveErrorAt(null);
          retryCountRef.current = 0;
          if (opts?.manual) toast.success(t("editor.saved"));
          return true;
        } catch (e) {
          console.error("[save failed]", e);
          // 낙관적 동시성 충돌(다른 탭/기기에서 갱신) — 재시도 금지, 자동저장 중단 후 안내.
          if (e instanceof HttpError && e.status === 409 && e.code === "conflict") {
            conflictRef.current = true;
            setSaveError(t("editor.conflict"));
            setSaveErrorAt(Date.now());
            retryCountRef.current += 1; // save() flush 루프 즉시 탈출용
            if (!conflictToastRef.current) {
              conflictToastRef.current = true;
              toast.error(t("editor.conflict"));
            }
          } else {
            setSaveError(saveErrMsg(e, t));
            setSaveErrorAt(Date.now());
            retryCountRef.current += 1;
            if (opts?.manual) toast.error(saveErrMsg(e, t));
          }
          return false;
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      })();
      savingPromiseRef.current = run;
      const ok = await run;
      savingPromiseRef.current = null;
      return ok;
    },
    [buildBody, buildSanitizedBody, ensureFreshToken, snapshotIsCurrent, t]
  );

  /**
   * 저장(플러시 보장) — 진행 중 저장이 있으면 종료까지 대기하고, 그 사이 편집이 있으면
   * 다시 저장해 dirty 가 없는 상태로 수렴시킨다. 내보내기가 이를 await 하므로 항상
   * 최신 내용의 DOCX 를 받는다(진행 중 early-return 으로 옛 내용을 내보내던 경쟁 방지).
   * 반환값: 서버가 최신 상태로 저장됐는지(실패·충돌 시 false).
   */
  const save = useCallback(
    async (opts?: { manual?: boolean }): Promise<boolean> => {
      const targetId = id;
      if (!targetId) return false;
      // 비수동 호출(자동저장·되돌리기 flush·뒤로가기)은 변경이 없고 진행 중 저장도 없으면
      // 스킵 — 불필요한 PATCH 가 리비전 복원/재오픈 로드와 경합하는 것을 방지한다.
      if (!opts?.manual && !dirtyRef.current && !savingPromiseRef.current) return true;
      for (let guard = 0; guard < 5; guard++) {
        while (savingPromiseRef.current) await savingPromiseRef.current.catch(() => {});
        const ok = await saveOnce(targetId, opts);
        // 실패(예외·409) 시 즉시 반복하지 않음 — 백오프 자동저장에 맡긴다.
        if (!ok) return false;
        if (!dirtyRef.current) return true;
      }
      return !dirtyRef.current;
    },
    [id, saveOnce]
  );

  // 신규 → 생성 후 라우트 이동. 기존 → 저장 후 id 반환(저장 실패 시 null — 내보내기 중단용).
  // 신규 생성 경로도 savingRef 로 중복 차단(연타 시 보고서 다중 생성 방지).
  const ensureId = useCallback(async (opts?: { manual?: boolean }): Promise<string | null> => {
    if (id) {
      const ok = await save(opts);
      return ok ? id : null;
    }
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    const created = await (async () => {
      try {
        await ensureFreshToken();
        await waitForPendingImageUploads(); // blob: src 저장 방지(saveOnce 와 동일)
        const body = buildSanitizedBody(buildBody());
        const row = await createReport(body);
        if (snapshotIsCurrent(body)) setDirty(false);
        updatedAtRef.current = row.updatedAt;
        setSavedAt(Date.now());
        setSaveError(null);
        setSaveErrorAt(null);
        retryCountRef.current = 0;
        createdIdRef.current = row.id;
        // 신규 생성 성공 — 'docx-draft:new' 잔존 제거(다음 /reports/new 에서
        // 직전 세션 draft 배너가 뜨는 현상 방지. 실패해도 치명적이지 않음).
        try {
          localStorage.removeItem("docx-draft:new");
        } catch {
          /* ignore */
        }
        navigate(`/reports/${row.id}`, { replace: true });
        if (opts?.manual) toast.success(t("editor.saved"));
        return row.id;
      } catch (e) {
        console.error("[create failed]", e);
        setSaveError(saveErrMsg(e, t));
        setSaveErrorAt(Date.now());
        retryCountRef.current += 1;
        if (opts?.manual) toast.error(saveErrMsg(e, t));
        return null;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
    // 생성 요청 중 편집이 있었으면(dirty) 즉시 flush — 신규 문서에서 바로 내보낼 때
    // 옛 내용이 DOCX 로 나가는 것을 방지.
    if (created && dirtyRef.current) {
      for (let guard = 0; guard < 5 && dirtyRef.current; guard++) {
        while (savingPromiseRef.current) await savingPromiseRef.current.catch(() => {});
        const retriesBefore = retryCountRef.current;
        await saveOnce(created, opts);
        if (retryCountRef.current > retriesBefore) break;
      }
    }
    return created;
  }, [id, save, buildBody, buildSanitizedBody, navigate, ensureFreshToken, snapshotIsCurrent, saveOnce, t]);

  // 1.5초 debounce 자동저장. 오프라인이면 보류(실패만 양산), 실패 후엔 지수 백오프(최대 30s) 재시도.
  // 409 충돌 중에는 재시도하지 않음 — 새로고침/되돌리기로 기준점이 갱신돼야 재개.
  useEffect(() => {
    if (conflictRef.current || isReadOnly || !dirty || !online) return;
    const delay = saveError
      ? Math.min(1500 * 2 ** Math.min(retryCountRef.current, 4), 30000)
      : 1500;
    const t = setTimeout(() => {
      // 리비전 되돌리기 창구(flush 완료~복원 커밋) 중 발사 차단 — 복원 직전 내용이
      // 복원된 문서를 PATCH 로 덮어쓰는 경쟁 방지.
      if (restoringRef.current) return;
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
      toast.success(t("editor.onlineRestored"));
    };
    const goOffline = () => {
      setOnline(false);
      toast.warning(t("editor.offlineWarning"));
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [t]);

  /** 내보내기 — 저장 flush 후 서버의 최신 내용으로 DOCX 생성. 저장/생성 실패 시 중단. */
  const handleExport = useCallback(async () => {
    try {
      const rid = await ensureId();
      if (!rid) {
        // 생성 또는 플러시 저장 실패 — 서버의 낡은 내용을 내보내는 것을 막는다.
        toast.error(t("editor.exportUnsaved"));
        return;
      }
      const blob = await exportReport(rid);
      downloadBlob(blob, `${(title || "document").slice(0, 80)}.docx`);
      toast.success(t("editor.exportDone"));
    } catch (e) {
      console.error("[export failed]", e);
      toast.error(saveErrMsg(e, t));
    }
  }, [ensureId, title, t]);

  // 리비전 되돌리기 직전 — 진행 중/대기 중(debounce) 저장을 flush.
  // flush 없이 되돌리면 직후 도착하는 PATCH 가 복원된 내용을 덮어쓴다.
  // restoringRef 로 flush 완료~복원 커밋 사이에 예약된 debounce 자동저장까지 차단.
  // (해제는 대화상자 닫힘 effect — save 는 예외를 밖으로 던지지 않음)
  const handleBeforeRestore = useCallback(async () => {
    restoringRef.current = true;
    await save();
  }, [save]);

  // 버전 기록 대화상자가 닫히면(복원 완료·실패 후 종료 모두) 되돌리기 창구 해제.
  useEffect(() => {
    if (!historyOpen) restoringRef.current = false;
  }, [historyOpen]);

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
    // 세션이 끊겨 죽은 blob: 이미지(업로드 미완료 노드)는 제거 후 복구 — 빈 박스 방지.
    applyEditorJson(stripBlobImages(draft.value.content));
    setOptions(normalizeOptions(draft.value.templateOptions));
    setTemplateId(draft.value.templateId);
    setDirty(true);
    clearDraft();
    toast.success(t("editor.draftRestored"));
  }, [draft, clearDraft, applyEditorJson, t]);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex h-12 items-center gap-2 border-b bg-background px-4">
          <Skeleton className="size-8 rounded" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> {t("common.loading")}
        </div>
      </div>
    );
  }

  const statusText =
    !online && dirty
      ? t("editor.statusOffline")
      : saveError ?? (saving ? t("editor.savingDots") : dirty ? t("editor.pending") : savedAt ? t("editor.saved") : "");
  // 상단바 상태 점(●) — 색/스피너 결정용. 모바일/PC 통합 인디케이터.
  type StatusState = "saving" | "error" | "offline" | "pending" | "saved" | "idle";
  const statusState: StatusState = saving
    ? "saving"
    : saveError
      ? "error"
      : !online && dirty
        ? "offline"
        : dirty
          ? "pending"
          : savedAt
            ? "saved"
            : "idle";
  const statusDotClass: Record<StatusState, string> = {
    saving: "",
    error: "bg-destructive",
    offline: "bg-amber-500",
    pending: "bg-amber-500",
    saved: "bg-emerald-500",
    idle: "bg-muted-foreground/40",
  };

  return (
    <div className="h-dvh flex flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // debounce 대기 중인 편집 손실 방지 — flush 저장을 걸어두고 즉시 이동.
            // PATCH 는 언마운트 후 비동기로 완료돼도 무해(상태 갱신은 no-op).
            if (!isReadOnly && id) void save();
            navigate("/reports");
          }}
          className="shrink-0"
          title={t("editor.backToList")}
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
        {/* 저장 상태 점(●) 인디케이터 — 모바일/PC 통합. hover 시 전체 상태 텍스트. */}
        {!isReadOnly && (
          <span className="flex shrink-0 items-center gap-1" title={statusText || undefined}>
            {statusState === "saving" ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <span className={`inline-block size-2 rounded-full ${statusDotClass[statusState]}`} />
            )}
            <span className="hidden text-xs text-muted-foreground sm:inline">{statusText}</span>
          </span>
        )}
        {/* ⋯ 더 보기: 저장·내보내기·공유·버전 기록.
            읽기 전용(공유받은 문서)에선 내보내기만 노출. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" title={t("editor.more")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {!isReadOnly && (
              <>
                <DropdownMenuItem onClick={() => void ensureId({ manual: true })}>
                  <Save className="size-4" />
                  <span>{t("editor.save")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem disabled={saving} onClick={() => void handleExport()}>
              <Download className="size-4" />
              <span>{t("export.button")}</span>
            </DropdownMenuItem>
            {!isReadOnly && id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <Users className="size-4" />
                  <span>{t("share.group.title")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPublicShareOpen(true)}>
                  <Globe className="size-4" />
                  <span>{t("share.public.title")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                  <History className="size-4" />
                  <span>{t("versionHistory.title")}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* 모바일: 우측 옵션 패널(Sheet) 열기 — PC는 aside 상시 노출 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOptionsOpen(true)}
          className="shrink-0 lg:hidden"
          title={t("editor.options")}
        >
          <SlidersHorizontal />
        </Button>
        <UserMenu />
      </header>

      {isReadOnly && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          <span>{t("editor.sharedBanner")}</span>
          {ownerName && <span>· {t("editor.owner")} {ownerName}</span>}
          {groupName && <span>· {groupName}</span>}
        </div>
      )}

      {/* 직전 세션에서 저장 못 한 임시 내용 복구 — localStorage 스냅샷이 남아있을 때만. */}
      {!isReadOnly && draft && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span>
            {t("editor.draftRestoreAt", {
              time: draft.ts ? new Date(draft.ts).toLocaleTimeString(i18n.language) : "",
            })}
          </span>
          <button type="button" onClick={restoreDraft} className="font-semibold underline">
            {t("editor.restore")}
          </button>
          <button type="button" onClick={clearDraft} className="underline">
            {t("editor.discard")}
          </button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col border-r">
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
              <SheetTitle>{t("editor.options")}</SheetTitle>
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
      {id && (
        <PublicShareDialog reportId={id} open={publicShareOpen} onOpenChange={setPublicShareOpen} />
      )}
      {!isReadOnly && (
        <VersionHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          reportId={id}
          onRestored={handleRestored}
          onBeforeRestore={handleBeforeRestore}
          hasUnsavedChanges={dirty}
        />
      )}
    </div>
  );
}
