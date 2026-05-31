import { useState } from "react";
import TipTapEditor from "./components/Editor/TipTapEditor";
import HeadingSymbolSelector from "./components/Editor/HeadingSymbolSelector";
import AnnotationModeSelector from "./components/Editor/AnnotationModeSelector";
import DocxPreview from "./components/Preview/DocxPreview";
import OptionsPanel from "./components/Options/OptionsPanel";
import DocxExporter from "./components/Export/DocxExporter";
import type { DocxOptions } from "./types/options";
import { defaultOptions } from "./types/options";

function App() {
  const [editorHtml, setEditorHtml] = useState("");
  const [options, setOptions] = useState<DocxOptions>(defaultOptions);

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
          <HeadingSymbolSelector options={options} onOptionsChange={setOptions} />
          <AnnotationModeSelector options={options} onOptionsChange={setOptions} />
          <TipTapEditor onContentChange={setEditorHtml} options={options} />
        </div>

        {/* Center panel - Preview */}
        <div className="flex-1 border-r border-gray-200 overflow-hidden">
          <DocxPreview html={editorHtml} options={options} />
        </div>

        {/* Right panel - Options */}
        <div className="flex-shrink-0 overflow-hidden" style={{ width: 360 }}>
          <OptionsPanel options={options} onOptionsChange={setOptions} />
        </div>
      </main>
    </div>
  );
}

export default App;
