import { useState, useCallback } from "react";
import type { DocxOptions } from "@/types/options";
import { defaultOptions } from "@/types/options";
import { markdownToHtml } from "@/utils/markdownToHtml";
import { htmlToMarkdown } from "@/utils/htmlToMarkdown";
import { INITIAL_MARKDOWN } from "@/components/Editor/TipTapEditor";
import TipTapEditor from "@/components/Editor/TipTapEditor";
import RichTextEditor from "@/components/Editor/RichTextEditor";
import HeadingSymbolSelector from "@/components/Editor/HeadingSymbolSelector";
import AnnotationModeSelector from "@/components/Editor/AnnotationModeSelector";
import DocxPreview from "@/components/Preview/DocxPreview";
import OptionsPanel from "@/components/Options/OptionsPanel";
import DocxExporter from "@/components/Export/DocxExporter";

type EditorTab = "text" | "editor";

export default function App() {
  const [activeTab, setActiveTab] = useState<EditorTab>("text");
  const [markdownContent, setMarkdownContent] = useState(INITIAL_MARKDOWN);
  const [editorHtml, setEditorHtml] = useState(() => markdownToHtml(INITIAL_MARKDOWN));
  const [options, setOptions] = useState<DocxOptions>(defaultOptions);

  // Text 모드 변경: 마크다운 → HTML 변환
  const handleMarkdownChange = useCallback((md: string) => {
    setMarkdownContent(md);
    setEditorHtml(markdownToHtml(md));
  }, []);

  // Editor 모드 변경: HTML 그대로 전달
  const handleHtmlChange = useCallback((html: string) => {
    setEditorHtml(html);
  }, []);

  // 탭 전환 시 콘텐츠 동기화
  const handleTabChange = useCallback(
    (tab: EditorTab) => {
      if (tab === activeTab) return;

      if (tab === "text" && activeTab === "editor") {
        // Editor → Text: HTML을 마크다운으로 역변환
        setMarkdownContent(htmlToMarkdown(editorHtml));
      }
      // Text → Editor: editorHtml이 이미 최신 상태이므로 추가 변환 불필요

      setActiveTab(tab);
    },
    [activeTab, editorHtml],
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white border-b border-gray-700">
        <h1 className="text-lg font-semibold">DOCX Editor</h1>
        <DocxExporter html={editorHtml} options={options} />
      </header>

      {/* Main 3-panel layout */}
      <main className="flex flex-1 overflow-hidden min-w-[1440px]">
        {/* Left panel - Editor */}
        <div className="flex-shrink-0 border-r border-gray-200 overflow-hidden flex flex-col" style={{ width: 560 }}>
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => handleTabChange("text")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "text"
                  ? "text-gray-900 border-b-2 border-blue-500 bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              Text
            </button>
            <button
              onClick={() => handleTabChange("editor")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "editor"
                  ? "text-gray-900 border-b-2 border-blue-500 bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              Editor
            </button>
          </div>

          <HeadingSymbolSelector options={options} onOptionsChange={setOptions} />
          <AnnotationModeSelector options={options} onOptionsChange={setOptions} />

          <div className="flex-1 overflow-hidden">
            {activeTab === "text" ? (
              <TipTapEditor value={markdownContent} onChange={handleMarkdownChange} options={options} />
            ) : (
              <RichTextEditor html={editorHtml} onHtmlChange={handleHtmlChange} options={options} />
            )}
          </div>
        </div>

        {/* Center panel - Preview */}
        <div className="flex-1 border-r border-gray-200 overflow-hidden">
          <DocxPreview
            html={editorHtml}
            options={options}
            editable={activeTab === "editor"}
            onContentChange={(cleanHtml) => {
              setEditorHtml(cleanHtml);
            }}
          />
        </div>

        {/* Right panel - Options */}
        <div className="flex-shrink-0 overflow-hidden" style={{ width: 360 }}>
          <OptionsPanel options={options} onOptionsChange={setOptions} />
        </div>
      </main>
    </div>
  );
}
