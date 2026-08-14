import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorContent } from "@tiptap/react";
import RichTextToolbar from "../Editor/RichTextToolbar";
import SelectionTextTool from "../Editor/SelectionTextTool";
import { TableToolbar } from "../Editor/TableToolbar";
import { getPreviewStyles } from "./previewStyles";
import { usePreviewEditor } from "./usePreviewEditor";
import { usePreviewScale } from "./usePreviewScale";
import { A4_WIDTH } from "./createPreviewExtensions";
import type { DocxOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";

interface DocxPreviewProps {
  /** 정규 콘텐츠 — ProseMirror JSON. 기호/괄호 등 미리보기 장식은 비영속이므로 제외됨. */
  json: JSONContent;
  options: DocxOptions;
  editable?: boolean;
  onContentChange?: (json: JSONContent) => void;
}

/**
 * A4 미리보기. 얇은 코디네이터 — 에디터/스케일 로직은 각 훅에 위임하고 여기선 조립만.
 *  - usePreviewEditor: 에디터 생성 + 콘텐츠 동기화/장식/페이지네이션 effects.
 *  - usePreviewScale: A4 축소 + 모바일 핀치줌.
 * 부모(ReportEditor/PublicReportView)는 json/options/editable/onContentChange 만 다룬다 —
 * editor/내부 상태는 밖으로 노출하지 않는다(캡슐화).
 */
export default function DocxPreview({
  json,
  options,
  editable = false,
  onContentChange,
}: DocxPreviewProps) {
  const editor = usePreviewEditor({ json, options, editable, onContentChange });
  const { containerRef, scaledInnerRef, effectiveScale, userZoom, setUserZoom, unscaledH } =
    usePreviewScale(editor);

  // 미리보기 CSS 는 options/editable 에만 의존. ReportEditor 는 타이핑마다 editorJson 만 바꾸고
  // options 참조는 안정적 → 타이핑 중엔 캐시 히트로 439줄 CSS 재생성/재주입/재파싱을 생략.
  // options(또는 editable) 가 실제로 바뀔 때만 재계산.
  const previewCss = useMemo(() => getPreviewStyles(options, editable), [options, editable]);

  // 비편집(공유 보기) 블록 선택 표시 — 편집 모드에서는 동작하지 않는다.
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editable) return;
      const target = e.target as HTMLElement;
      const block = target.closest("h1, h2, h3, h4, h5, h6, p, div[data-title]");
      if (block && block.parentElement?.classList.contains("ProseMirror")) {
        setSelectedElement(block as HTMLElement);
      } else {
        setSelectedElement(null);
      }
    },
    [editable]
  );

  useEffect(() => {
    if (editable) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedElement(null);
      }
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, [editable]);

  useEffect(() => {
    const prev = document.querySelector(".preview-block-selected");
    if (prev) prev.classList.remove("preview-block-selected");
    if (selectedElement) selectedElement.classList.add("preview-block-selected");
  }, [selectedElement]);

  return (
    <div className="relative h-full flex flex-col">
      {editable && <RichTextToolbar editor={editor} />}
      {editable && editor && <TableToolbar editor={editor} />}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onClick={handleClick}
        style={{
          backgroundColor: "var(--preview-canvas)",
          paddingTop: 20,
          paddingBottom: 20,
          // pan-y(세로 스크롤만 허용) — 가로 미세 흔들림이 스크롤로 오인돼 모바일 탭 selection 이
          // 포기되는 것(PM MouseDown.up allowDefault)을 줄인다. 핀치줌은 별도(2손가락), 표 셀은 touch-action:none.
          touchAction: "pan-y",
        }}
      >
        <style>{previewCss}</style>
        <div
          style={{
            width: A4_WIDTH * effectiveScale,
            height: unscaledH ? unscaledH * effectiveScale : undefined,
            margin: "0 auto",
            position: "relative",
            overflow: "visible",
          }}
        >
          <div
            ref={scaledInnerRef}
            style={{
              width: A4_WIDTH,
              transform: `scale(${effectiveScale})`,
              transformOrigin: "top left",
              flexShrink: 0,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {userZoom !== 1 && (
        <button
          type="button"
          onClick={() => setUserZoom(1)}
          className="absolute bottom-3 right-3 z-20 rounded-full border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur hover:bg-background"
        >
          {Math.round(effectiveScale * 100)}%
        </button>
      )}
      {/* 텍스트 드래그 선택 시 굵게/밑줄/꼬마글씨 플로팅 도구(편집 모드만) */}
      {editable && <SelectionTextTool editor={editor} scrollRef={containerRef} />}
    </div>
  );
}
