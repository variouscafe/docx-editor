import { useEffect, useMemo, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { DocxOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import { flattenLists } from "@/utils/flattenLists";
import { forceRedecorate } from "../Editor/extensions/previewDecorations";
import { ensureHeadingPrefixes, hasAnyHeadingPrefixMark } from "../Editor/extensions/headingPrefix";
import { forceRemeasure } from "../Editor/extensions/measurePagination";
import { createPreviewExtensions, A4_HEIGHT, A4_WIDTH } from "./createPreviewExtensions";

export interface UsePreviewEditorArgs {
  json: JSONContent;
  options: DocxOptions;
  editable: boolean;
  onContentChange?: (json: JSONContent) => void;
}

/**
 * 미리보기 에디터 인스턴스 + 콘텐츠 동기화 effects 를 한 곳으로.
 *  - createPreviewExtensions 로 extensions/editorProps 생성(마운트 1회).
 *  - 콘텐츠 동기화: 에디터가 생산한 JSON 이 그대로 돌아오면 setContent 스킵(커서 리셋 방지).
 *  - heading prefix 마이그레이션/재적용, 장식 강제 재계산, 페이지네이션 재측정 킥.
 * editor 만 반환(툴바·EditorContent 가 소비). 캡슐화 유지.
 */
export function usePreviewEditor({ json, options, editable, onContentChange }: UsePreviewEditorArgs): Editor | null {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // 에디터가 onUpdate 로 방금 생산한 JSON(편집 결과)을 기록. 부모 상태(json prop) 로 되돌아온
  // 같은 참조면 setContent 를 재실행하지 않아 커서가 리셋(문서 끝으로 점프)되는 것을 막는다.
  const lastEditorJsonRef = useRef<JSONContent | null>(null);

  // 과거 list 노드가 있으면 paragraph 로 평탄화(스키마 호환 — 기존 문서 열람 보정).
  const safeJson = useMemo(() => flattenLists(json), [json]);

  // extensions/editorProps 는 마운트 1회 생성. getOptions 클로저가 optionsRef 를 읽어
  // 항상 최신 options 를 플러그인(Decoration/MeasurePagination)에 전달한다.
  const factory = useMemo(
    () =>
      createPreviewExtensions({
        getOptions: () => optionsRef.current,
        pageHeight: A4_HEIGHT,
        pageWidth: A4_WIDTH,
      }),
    [],
  );

  const editor = useEditor({
    extensions: factory.extensions,
    editorProps: factory.editorProps,
    // ReportEditor 는 React.lazy(Suspense) 로 로드된다. 기본값 immediatelyRender:true 는
    // 렌더 도중 에디터를 선행 생성한 뒤 1ms scheduleDestroy 타이머로 파괴하는데, Suspense 의
    // reconnectPassiveEffects 경로와 엮여 "파괴된 에디터의 editor.commands 접근" 크래시를 유발.
    // CSR 전용(SSR 없음)이므로 false 로 두어 렌더-효과 경쟁을 원천 차단.
    immediatelyRender: false,
    editable,
    content: safeJson,
    onUpdate: ({ editor: e }) => {
      // getJSON() 은 비영속 장식(기호/괄호)을 제외한 깨끗한 문서 → 그대로 저장.
      const j = e.getJSON();
      lastEditorJsonRef.current = j;
      onContentChangeRef.current?.(j);
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  // json 이 바뀌면 콘텐츠 교체. 단, 에디터가 방금 생산한 JSON(편집)이 그대로 돌아온 경우는 제외 —
  // 다시 setContent 하면 커서가 리셋되어 input rule(`# ` → 헤딩) 직후 커서가 문서 끝/다음 문단으로
  // 튕겨 "줄바꿈"처럼 보이는 문제가 발생. flattenLists 는 항상 새 객체이므로 raw json 참조로 비교.
  useEffect(() => {
    if (editor && !editor.isDestroyed && json && json !== lastEditorJsonRef.current) {
      editor.commands.setContent(safeJson, { emitUpdate: false });
      if (!hasAnyHeadingPrefixMark(editor.state.doc)) {
        ensureHeadingPrefixes(editor, optionsRef.current);
      }
    }
  }, [editor, json, safeJson]);

  // 헤딩 symbol/선행공백 옵션 변경 시 prefix 재적용(사용자가 옵션을 바꾼 경우만).
  // 첫 마운트는 sig 만 기록(사용자 편집 리셋 방지).
  const prevHeadingSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const sig = JSON.stringify(
      ([1, 2, 3, 4, 5, 6] as const).map((l) => {
        const h = options[`h${l}`];
        return [h.lineStartSymbol, h.leadingSpaces];
      })
    );
    if (prevHeadingSigRef.current === null) {
      prevHeadingSigRef.current = sig;
      return;
    }
    if (sig !== prevHeadingSigRef.current) {
      prevHeadingSigRef.current = sig;
      ensureHeadingPrefixes(editor, options);
    }
  }, [editor, options]);

  // 옵션 변경 시 장식(기호/카운터/꼬마글씨) 강제 재계산 + 페이지네이션 재측정.
  // 마진 변경(pageContentAreaHeight), 꼬마글씨2 위젨 추가(블록 높이) 등 옵션이 페이지 수/경계에
  // 영향을 주는 경우를 재측정. forceRemeasure 는 view.update 의 "doc 미변경 스킵" 가드를 우회.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    forceRedecorate(editor);
    forceRemeasure(editor);
  }, [editor, options]);

  // 페이지네이션(MeasurePagination) 보정: DOM 실측 기반으로 페이지 수를 정하는데, 최초 1회 측정 시
  // 장식/폰트/footer 렌더가 덜 끝난 상태면 페이지 수가 부족하게 고정된다. 편집 모드는 사용자 조작
  // 트랜잭션으로 자연히 재측정되지만, 비편집(공유 보기)은 트랜잭션이 없어 잘못된 수(undercount)에
  // 고정된다 → forceRemeasure 로 재측정 예약(no-op dispatch 대신 — doc 미변경 스킵 가드 우회).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const kick = () => {
      if (!editor.isDestroyed) forceRemeasure(editor);
    };
    const t1 = window.setTimeout(kick, 0); // 1차: 초기 장식 렌더 후
    const t2 = window.setTimeout(kick, 400); // 2차: 폰트/footer 렌더 후
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [editor]);

  return editor;
}
