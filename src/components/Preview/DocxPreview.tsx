import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { PaginationPlus, PAGE_SIZES } from "tiptap-pagination-plus";
import { BoxBorder } from "../Editor/extensions/boxBorder";
import { HighlightExtension } from "../Editor/extensions/highlightColors";
import { AnnotationExtension } from "../Editor/extensions/annotation";
import { CoreSummaryExtension } from "../Editor/extensions/coreSummary";
import { TitleExtension } from "../Editor/extensions/title";
import { HeadingHardBreak } from "../Editor/extensions/headingHardBreak";
import RichTextToolbar from "../Editor/RichTextToolbar";
import { applyOptionsToHtml, stripPreviewTransforms } from "../../utils/htmlToPreview";
import type { DocxOptions } from "../../types/options";

const A4_WIDTH = PAGE_SIZES.A4.pageWidth;
const A4_HEIGHT = PAGE_SIZES.A4.pageHeight;

interface DocxPreviewProps {
  html: string;
  options: DocxOptions;
  editable?: boolean;
  onContentChange?: (cleanHtml: string) => void;
}

export default function DocxPreview({
  html,
  options,
  editable = false,
  onContentChange,
}: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const previewHtml = useMemo(
    () => applyOptionsToHtml(html, options),
    [html, options],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      BoxBorder,
      HighlightExtension,
      AnnotationExtension,
      CoreSummaryExtension,
      TitleExtension,
      HeadingHardBreak,
      PaginationPlus.configure({
        pageHeight: A4_HEIGHT,
        pageWidth: A4_WIDTH,
        pageGap: 30,
        pageGapBorderSize: 0,
        pageBreakBackground: "#d1d5db",
        marginTop: options.common.marginTop / 2.54 * 72,
        marginBottom: options.common.marginBottom / 2.54 * 72,
        marginLeft: options.common.marginLeft / 2.54 * 72,
        marginRight: options.common.marginRight / 2.54 * 72,
        footerRight: "{page}",
      }),
    ],
    editable,
    content: previewHtml,
    onUpdate: ({ editor: e }) => {
      if (onContentChangeRef.current) {
        const editedHtml = e.getHTML();
        const cleanHtml = stripPreviewTransforms(editedHtml, options);
        onContentChangeRef.current(cleanHtml);
      }
    },
  });

  // Update editable state dynamically
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (editor && previewHtml !== editor.getHTML()) {
      editor.commands.setContent(previewHtml);
    }
  }, [editor, previewHtml]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar for editable mode */}
      {editable && (
        <RichTextToolbar editor={editor} />
      )}
      {/* Preview area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{
          backgroundColor: "#9ca3af",
        }}
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
  return `
    .rm-with-pagination {
      background: #ffffff !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }

    .rm-with-pagination .ProseMirror {
      word-break: keep-all;
      overflow-wrap: break-word;
      line-height: 1.6;
      font-family: ${options.common.fontFamily};
    }

    .rm-with-pagination .ProseMirror:focus {
      outline: none;
    }

    .rm-with-pagination .rm-pagination-gap {
      background-color: #d1d5db !important;
    }

    /* 제목: 20pt, 굵게, 밑줄, 가운데 정렬 */
    .rm-with-pagination [data-title] {
      font-size: ${options.title.fontSize}pt;
      font-weight: ${options.title.bold ? 700 : 400};
      text-align: ${options.title.align};
      text-decoration: ${options.title.underline ? "underline" : "none"};
      margin-bottom: ${options.title.paragraphSpacing}pt;
    }

    .rm-with-pagination h1 {
      font-size: ${options.h1.fontSize}pt;
      font-weight: ${options.h1.bold ? 700 : 400};
      margin-bottom: ${options.h1.paragraphSpacing}pt;
    }

    .rm-with-pagination h2 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-bottom: ${options.h2.paragraphSpacing}pt;
    }

    .rm-with-pagination h3 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-bottom: ${options.common.paragraphSpacing}pt;
    }

    .rm-with-pagination h4 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-bottom: ${options.h4.singleLineSpacing}pt;
    }

    .rm-with-pagination h5 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-bottom: ${options.common.paragraphSpacing}pt;
    }

    .rm-with-pagination h6 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-bottom: ${options.common.paragraphSpacing}pt;
    }

    .rm-with-pagination p {
      font-size: ${options.common.fontSize}pt;
      margin-bottom: ${options.common.paragraphSpacing}pt;
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

    /* 꼬마글씨 Mode 1: floating annotation layer — no impact on text flow */
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

    /* 꼬마글씨 Mode 2: block paragraph — handled by htmlToPreview transformation */
    .rm-with-pagination [data-annotation-paragraph] {
      font-size: ${options.annotation2.fontSize}pt;
      font-family: ${options.common.fontFamily};
      margin-bottom: ${options.annotation2.paragraphSpacing}pt;
      color: ${options.common.fontFamily === options.annotation1.fontFamily ? '#333' : '#333'};
    }

    /* 핵심요약: [ ] 괄호 형태 — 좌우 보더 + 상하 코너 세그먼트 */
    .rm-with-pagination [data-core-summary] {
      display: block;
      border-left: 2px solid #333;
      border-right: 2px solid #333;
      padding: 8px 12px;
      margin: 8px 0;
      position: relative;
    }
    /* 상단 좌측·우측 코너 ┏ ┓ */
    .rm-with-pagination [data-core-summary]::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }
    /* 하단 좌측·우측 코너 ┗ ┛ */
    .rm-with-pagination [data-core-summary]::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }

    /* 텍스트 선택 시 파란색 하이라이트 */
    .rm-with-pagination .ProseMirror ::selection {
      background: #3b82f6;
      color: #ffffff;
    }
    .rm-with-pagination .ProseMirror::selection {
      background: #3b82f6;
      color: #ffffff;
    }

    /* 문단 호버 시 연한 파란색 배경 */
    .rm-with-pagination .ProseMirror > h1:hover,
    .rm-with-pagination .ProseMirror > h2:hover,
    .rm-with-pagination .ProseMirror > h3:hover,
    .rm-with-pagination .ProseMirror > h4:hover,
    .rm-with-pagination .ProseMirror > h5:hover,
    .rm-with-pagination .ProseMirror > h6:hover,
    .rm-with-pagination .ProseMirror > p:hover,
    .rm-with-pagination .ProseMirror > div:hover {
      background-color: rgba(59, 130, 246, 0.06);
      border-radius: 2px;
    }
  `;
}
