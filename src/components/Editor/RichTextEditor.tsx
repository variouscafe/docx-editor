import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { BoxBorder } from "./extensions/boxBorder";
import { HighlightExtension } from "./extensions/highlightColors";
import { AnnotationExtension } from "./extensions/annotation";
import { CoreSummaryExtension } from "./extensions/coreSummary";
import { TitleExtension } from "./extensions/title";
import { HeadingHardBreak } from "./extensions/headingHardBreak";
import RichTextToolbar from "./RichTextToolbar";
import type { DocxOptions } from "../../types/options";

interface RichTextEditorProps {
  html: string;
  onHtmlChange: (html: string) => void;
  options: DocxOptions;
}

export default function RichTextEditor({
  html,
  onHtmlChange,
}: RichTextEditorProps) {
  const onHtmlChangeRef = useRef(onHtmlChange);
  onHtmlChangeRef.current = onHtmlChange;

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
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    editable: true,
    content: html,
    onUpdate: ({ editor: e }) => {
      onHtmlChangeRef.current(e.getHTML());
    },
  });

  // Sync content when html prop changes externally (e.g., tab switch)
  useEffect(() => {
    if (editor && html !== editor.getHTML()) {
      editor.commands.setContent(html);
    }
  }, [editor, html]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <RichTextToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="tiptap-editor-content h-full"
        />
      </div>
      <style>{`
        .tiptap-editor-content .ProseMirror {
          padding: 16px;
          min-height: 100%;
          outline: none;
          font-family: Batang, BatangChe, 바탕, 바탕체, 'Batang Che', 'Nanum Myeongjo', AppleMyungjo, serif;
          font-size: 14px;
          line-height: 1.6;
          color: #111827;
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        .tiptap-editor-content .ProseMirror:focus {
          outline: none;
        }
        .tiptap-editor-content .ProseMirror h1 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 24px;
        }
        .tiptap-editor-content .ProseMirror h2 {
          font-size: 14px;
          font-weight: 400;
          margin-bottom: 16px;
        }
        .tiptap-editor-content .ProseMirror h3,
        .tiptap-editor-content .ProseMirror h4,
        .tiptap-editor-content .ProseMirror h5,
        .tiptap-editor-content .ProseMirror h6 {
          font-size: 14px;
          font-weight: 400;
          margin-bottom: 12px;
        }
        .tiptap-editor-content .ProseMirror p {
          margin-bottom: 12px;
        }
        .tiptap-editor-content .ProseMirror [data-border="solid"] {
          display: block;
          border: 1.5px solid #333;
          padding: 12px 16px;
          margin: 8px 0;
          border-radius: 2px;
        }
        .tiptap-editor-content .ProseMirror [data-border="dashed"] {
          display: block;
          border: 1.5px dashed #666;
          padding: 12px 16px;
          margin: 8px 0;
          border-radius: 2px;
        }
        .tiptap-editor-content .ProseMirror mark {
          border-radius: 2px;
          padding: 0 2px;
        }
        .tiptap-editor-content .ProseMirror [data-annotation] {
          position: relative;
          display: inline;
          background: #eef;
          border-bottom: 1px dashed #00f;
        }
        .tiptap-editor-content .ProseMirror [data-annotation]::after {
          content: attr(data-annotation);
          position: absolute;
          left: 0;
          top: 100%;
          font-size: 10px;
          font-family: Batang, BatangChe, serif;
          color: #0000ff;
          line-height: 1.3;
          white-space: nowrap;
          pointer-events: none;
          z-index: 10;
        }
        .tiptap-editor-content .ProseMirror [data-core-summary] {
          display: block;
          border-left: 2px solid #333;
          border-right: 2px solid #333;
          padding: 8px 12px;
          margin: 8px 0;
          position: relative;
        }
        .tiptap-editor-content .ProseMirror [data-core-summary]::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
        }
        .tiptap-editor-content .ProseMirror [data-core-summary]::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
        }
        .tiptap-editor-content .ProseMirror [data-title] {
          font-size: 20px;
          font-weight: 700;
          text-align: center;
          text-decoration: underline;
          margin-bottom: 24px;
        }
        .tiptap-editor-content .ProseMirror ul,
        .tiptap-editor-content .ProseMirror ol {
          padding-left: 24px;
          margin-bottom: 12px;
        }
        .tiptap-editor-content .ProseMirror li {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}
