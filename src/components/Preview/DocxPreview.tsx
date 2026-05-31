import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { PaginationPlus, PAGE_SIZES } from "tiptap-pagination-plus";
import { BoxBorder } from "../Editor/extensions/boxBorder";
import { HighlightExtension } from "../Editor/extensions/highlightColors";
import { AnnotationExtension } from "../Editor/extensions/annotation";
import { applyOptionsToHtml } from "../../utils/htmlToPreview";
import type { DocxOptions } from "../../types/options";

const A4_WIDTH = PAGE_SIZES.A4.pageWidth;
const A4_HEIGHT = PAGE_SIZES.A4.pageHeight;

interface DocxPreviewProps {
  html: string;
  options: DocxOptions;
}

export default function DocxPreview({ html, options }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const previewHtml = useMemo(
    () => applyOptionsToHtml(html, options),
    [html, options]
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
      PaginationPlus.configure({
        pageHeight: A4_HEIGHT,
        pageWidth: A4_WIDTH,
        pageGap: 30,
        pageGapBorderSize: 0,
        pageBreakBackground: "#d1d5db",
        marginTop: 60,
        marginBottom: 60,
        marginLeft: 50,
        marginRight: 50,
        footerRight: "{page}",
      }),
    ],
    editable: false,
    content: previewHtml,
  });

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
    <div
      ref={containerRef}
      className="h-full overflow-auto"
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

    .rm-with-pagination .rm-pagination-gap {
      background-color: #d1d5db !important;
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
  `;
}
