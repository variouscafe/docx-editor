import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { PaginationPlus, PAGE_SIZES } from "tiptap-pagination-plus";
import { BoxBorder } from "../Editor/extensions/boxBorder";
import { HighlightExtension } from "../Editor/extensions/highlightColors";
import { AnnotationExtension } from "../Editor/extensions/annotation";
import { CoreSummaryExtension } from "../Editor/extensions/coreSummary";
import { TitleExtension } from "../Editor/extensions/title";
import { HeadingHardBreak } from "../Editor/extensions/headingHardBreak";
import { FontSize } from "../Editor/extensions/fontSize";
import { PreviewDecorations, forceRedecorate } from "../Editor/extensions/previewDecorations";
import { TrimTrailingEmpty } from "../Editor/extensions/trimTrailingEmpty";
import {
  HeadingPrefix,
  HeadingPrefixSync,
  ensureHeadingPrefixes,
  hasAnyHeadingPrefixMark,
} from "../Editor/extensions/headingPrefix";
import RichTextToolbar from "../Editor/RichTextToolbar";
import type { DocxOptions } from "@shared/options";
import { resolveSpacing } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import { flattenLists } from "@/utils/flattenLists";

const A4_WIDTH = PAGE_SIZES.A4.pageWidth;
const A4_HEIGHT = PAGE_SIZES.A4.pageHeight;

interface DocxPreviewProps {
  /** 정규 콘텐츠 — ProseMirror JSON. 기호/괄호 등 미리보기 장식은 비영속이므로 제외됨. */
  json: JSONContent;
  options: DocxOptions;
  editable?: boolean;
  onContentChange?: (json: JSONContent) => void;
}

export default function DocxPreview({
  json,
  options,
  editable = false,
  onContentChange,
}: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // 에디터가 onUpdate 로 방금 생산한 JSON(편집 결과)을 기록.
  // 부모 상태(json prop) 로 되돌아온 같은 참조면 setContent 를 재실행하지 않아
  // 커서가 리셋(문서 끝으로 점프)되는 것을 막는다.
  const lastEditorJsonRef = useRef<JSONContent | null>(null);

  // 과거 list 노드가 있으면 paragraph 로 평탄화(스키마 호환 — 기존 문서 열람 보정).
  const safeJson = useMemo(() => flattenLists(json), [json]);

  // Decoration 플러그인이 항상 최신 options 를 읽도록 홀더 유지.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Click handler for paragraph/heading selection (비편집 모드에서만 동작).
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editable) return;
    const target = e.target as HTMLElement;
    const block = target.closest('h1, h2, h3, h4, h5, h6, p, div[data-title]');
    if (block && block.parentElement?.classList.contains('ProseMirror')) {
      setSelectedElement(block as HTMLElement);
    } else {
      setSelectedElement(null);
    }
  }, [editable]);

  useEffect(() => {
    if (editable) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedElement(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [editable]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        // 사내 양식은 헤딩 시작기호(1., ①, □, -, •)가 번호/불릿 역할을 하므로
        // TipTap 기본 리스트 노드·input rule(`- `, `* `, `1. ` 자동변환)은 비활성화.
        // → "1. " 입력이 번호 리스트로 변형되어 H1 기호(1.)와 충돌하는 문제 방지.
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      BoxBorder,
      FontSize,
      HighlightExtension,
      AnnotationExtension,
      CoreSummaryExtension,
      TitleExtension,
      HeadingHardBreak,
      HeadingPrefix,
      HeadingPrefixSync.configure({ getOptions: () => optionsRef.current }),
      PreviewDecorations.configure({ getOptions: () => optionsRef.current }),
      TrimTrailingEmpty,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      PaginationPlus.configure({
        pageHeight: A4_HEIGHT,
        pageWidth: A4_WIDTH,
        pageGap: 30,
        pageGapBorderSize: 0,
        pageBreakBackground: "var(--preview-gap)",
        marginTop: (options.common.marginTop / 2.54) * 72,
        marginBottom: (options.common.marginBottom / 2.54) * 72,
        marginLeft: (options.common.marginLeft / 2.54) * 72,
        marginRight: (options.common.marginRight / 2.54) * 72,
        footerRight: "{page}",
      }),
    ],
    editable,
    content: safeJson,
    onUpdate: ({ editor: e }) => {
      // getJSON() 은 비영속 장식(기호/괄호)을 제외한 깨끗한 문서 → 그대로 저장.
      const j = e.getJSON();
      // 에디터가 생산한 JSON 을 기록(같은 참조가 json prop 으로 돌아오면 setContent 스킵).
      lastEditorJsonRef.current = j;
      onContentChangeRef.current?.(j);
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  // json 이 바뀌면 콘텐츠 교체. 단, 에디터가 방금 생산한 JSON(편집)이 그대로 돌아온 경우는
  // 제외 — 다시 setContent 하면 커서가 리셋되어 input rule(`# ` → 헤딩) 직후
  // 커서가 문서 끝/다음 문단으로 튕겨 "줄바꿈"처럼 보이는 문제가 발생한다.
  // 주: flattenLists 는 항상 새 객체를 반환하므로, 비교는 raw json 참조로 해야 가드가 작동한다.
  useEffect(() => {
    if (editor && json && json !== lastEditorJsonRef.current) {
      editor.commands.setContent(safeJson, { emitUpdate: false });
      // 구 포맷(prefix 미포함) 마이그레이션 → 각 헤딩에 prefix 실제 텍스트 삽입.
      if (!hasAnyHeadingPrefixMark(editor.state.doc)) {
        ensureHeadingPrefixes(editor, optionsRef.current);
      }
    }
  }, [editor, json, safeJson]);

  // 헤딩 symbol/선행공백 옵션 변경 시 prefix 재적용(사용자가 옵션을 바꾼 경우만).
  // 첫 마운트는 sig 만 기록(사용자 편집 리셋 방지).
  const prevHeadingSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
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

  // 옵션 변경 시 장식(기호/카운터/꼬마글씨) 강제 재계산.
  useEffect(() => {
    if (editor) forceRedecorate(editor);
  }, [editor, options]);

  const calcScale = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48;
      setScale(Math.min(containerWidth / A4_WIDTH, 1));
    }
  }, []);

  useEffect(() => {
    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [calcScale]);

  useEffect(() => {
    const prev = document.querySelector('.preview-block-selected');
    if (prev) prev.classList.remove('preview-block-selected');
    if (selectedElement) selectedElement.classList.add('preview-block-selected');
  }, [selectedElement]);

  return (
    <div className="h-full flex flex-col">
      {editable && <RichTextToolbar editor={editor} />}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onClick={handleClick}
        style={{ backgroundColor: "var(--preview-canvas)" }}
      >
        <style>{getPreviewStyles(options)}</style>
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            minHeight: "100%",
            display: "flex",
            justifyContent: "center",
            paddingTop: 20,
            paddingBottom: 20,
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function getPreviewStyles(options: DocxOptions): string {
  // 정규화된 간격(줄 간격/단락 앞/단락 뒤) — DOCX 와 동일 로직(resolveSpacing).
  const sc = resolveSpacing(options.common).css;
  const st = resolveSpacing(options.title).css;
  const sh: Record<number, ReturnType<typeof resolveSpacing>["css"]> = {
    1: resolveSpacing(options.h1).css,
    2: resolveSpacing(options.h2).css,
    3: resolveSpacing(options.h3).css,
    4: resolveSpacing(options.h4).css,
    5: resolveSpacing(options.h5).css,
    6: resolveSpacing(options.h6).css,
  };
  const sa2 = resolveSpacing(options.annotation2).css;
  return `
    .rm-with-pagination {
      background: #ffffff !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }

    .rm-with-pagination .ProseMirror {
      word-break: keep-all;
      overflow-wrap: break-word;
      line-height: 1.6;
      font-family: ${options.common.fontFamily} !important;
    }

    .rm-with-pagination .ProseMirror:focus {
      outline: none;
    }

    .rm-with-pagination .rm-pagination-gap {
      background-color: var(--preview-gap) !important;
    }

    /* 제목: 20pt, 굵게, 밑줄, 가운데 정렬 */
    .rm-with-pagination [data-title] {
      font-size: ${options.title.fontSize}pt;
      font-weight: ${options.title.bold ? 700 : 400};
      text-align: ${options.title.align};
      text-decoration: ${options.title.underline ? "underline" : "none"};
      margin-top: ${st.marginTop};
      margin-bottom: ${st.marginBottom};
      line-height: ${st.lineHeight};
    }

    .rm-with-pagination h1 {
      font-size: ${options.h1.fontSize}pt;
      font-weight: ${options.h1.bold ? 700 : 400};
      margin-top: ${sh[1].marginTop};
      margin-bottom: ${sh[1].marginBottom};
      line-height: ${sh[1].lineHeight};
    }

    .rm-with-pagination h2 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[2].marginTop};
      margin-bottom: ${sh[2].marginBottom};
      line-height: ${sh[2].lineHeight};
    }

    .rm-with-pagination h3 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[3].marginTop};
      margin-bottom: ${sh[3].marginBottom};
      line-height: ${sh[3].lineHeight};
    }

    .rm-with-pagination h4 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[4].marginTop};
      margin-bottom: ${sh[4].marginBottom};
      line-height: ${sh[4].lineHeight};
    }

    .rm-with-pagination h5 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[5].marginTop};
      margin-bottom: ${sh[5].marginBottom};
      line-height: ${sh[5].lineHeight};
    }

    .rm-with-pagination h6 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[6].marginTop};
      margin-bottom: ${sh[6].marginBottom};
      line-height: ${sh[6].lineHeight};
    }

    .rm-with-pagination p {
      font-size: ${options.common.fontSize}pt;
      margin-top: ${sc.marginTop};
      margin-bottom: ${sc.marginBottom};
      line-height: ${sc.lineHeight};
    }

    /* 굵은 기호(1., 1), □, Ⅰ) 헤딩 — 기호+본문 모두 굵게(docx 와 일치) */
    .rm-with-pagination [data-bold-symbol="true"] {
      font-weight: 700 !important;
    }

    /* 워드 스타일 엔터 기호(¶) 표시 */
    .rm-with-pagination .ProseMirror p::after,
    .rm-with-pagination .ProseMirror h1::after,
    .rm-with-pagination .ProseMirror h2::after,
    .rm-with-pagination .ProseMirror h3::after,
    .rm-with-pagination .ProseMirror h4::after,
    .rm-with-pagination .ProseMirror h5::after,
    .rm-with-pagination .ProseMirror h6::after {
      content: "¶" !important;
      display: inline !important;
      color: #b0b0b0 !important;
      font-size: 0.75em !important;
      margin-left: 1px !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    .rm-with-pagination [data-border="solid"] {
      display: block;
      border: 1.5px solid #333;
      padding: 12px 16px;
      margin: 8px 0;
      border-radius: 2px;
    }

    .rm-with-pagination [data-border="dashed"] {
      display: block;
      border: 1.5px dashed #666;
      padding: 12px 16px;
      margin: 8px 0;
      border-radius: 2px;
    }

    .rm-with-pagination mark {
      border-radius: 2px;
      padding: 0 2px;
    }

    /* 꼬마글씨 Mode 1: floating annotation layer */
    .rm-with-pagination [data-annotation] {
      position: relative;
      display: inline;
    }
    .rm-with-pagination [data-annotation]::after {
      content: attr(data-annotation);
      position: absolute;
      left: 0;
      top: 100%;
      font-size: ${options.annotation1.fontSize}pt;
      font-family: ${options.annotation1.fontFamily};
      color: ${options.annotation1.color};
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
    }

    /* 꼬마글씨 Mode 2: 블록 뒤 위젯으로 렌더(Decoration) */
    .rm-with-pagination [data-annotation-paragraph] {
      font-size: ${options.annotation2.fontSize}pt;
      font-family: ${options.common.fontFamily} !important;
      margin-top: ${sa2.marginTop};
      margin-bottom: ${sa2.marginBottom};
      line-height: ${sa2.lineHeight};
      color: #333;
    }

    /* 핵심요약: [ ] 괄호 형태 */
    .rm-with-pagination [data-core-summary] {
      display: block;
      border-left: 2px solid #333;
      border-right: 2px solid #333;
      padding: 8px 12px;
      margin: 8px 0;
      position: relative;
    }
    .rm-with-pagination [data-core-summary]::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }
    .rm-with-pagination [data-core-summary]::after {
      content: "";
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }

    /* 텍스트 선택 시 파란색 하이라이트 */
    .rm-with-pagination .ProseMirror ::selection {
      background: var(--preview-accent);
      color: #ffffff;
    }
    .rm-with-pagination .ProseMirror::selection {
      background: var(--preview-accent);
      color: #ffffff;
    }

    /* 문단 호버 시 연한 파란색 박스 */
    .rm-with-pagination .ProseMirror > h1:hover,
    .rm-with-pagination .ProseMirror > h2:hover,
    .rm-with-pagination .ProseMirror > h3:hover,
    .rm-with-pagination .ProseMirror > h4:hover,
    .rm-with-pagination .ProseMirror > h5:hover,
    .rm-with-pagination .ProseMirror > h6:hover,
    .rm-with-pagination .ProseMirror > p:hover,
    .rm-with-pagination .ProseMirror > div[data-title]:hover {
      background-color: color-mix(in oklch, var(--preview-accent) 8%, transparent);
      outline: 1px solid color-mix(in oklch, var(--preview-accent) 20%, transparent);
      outline-offset: -1px;
      border-radius: 2px;
      cursor: pointer;
    }

    /* 클릭 선택 시 파란색 박스 */
    .rm-with-pagination .ProseMirror > .preview-block-selected,
    .rm-with-pagination .ProseMirror > .preview-block-selected:hover {
      background-color: color-mix(in oklch, var(--preview-accent) 12%, transparent);
      outline: 2px solid color-mix(in oklch, var(--preview-accent) 40%, transparent);
      outline-offset: -1px;
      border-radius: 2px;
    }

    /* 표 스타일 */
    .rm-with-pagination table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-family: ${options.common.fontFamily} !important;
    }
    .rm-with-pagination table td,
    .rm-with-pagination table th {
      border: 1px solid #333;
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
      min-width: 50px;
      position: relative;
    }
    .rm-with-pagination table th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
    .rm-with-pagination table .selectedCell::after {
      z-index: 2;
      position: absolute;
      content: "";
      left: 0; right: 0; top: 0; bottom: 0;
      background: color-mix(in oklch, var(--preview-accent) 15%, transparent);
      pointer-events: none;
    }
    .rm-with-pagination table .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: -2px;
      width: 4px;
      background-color: var(--preview-accent);
      pointer-events: none;
    }
  `;
}
