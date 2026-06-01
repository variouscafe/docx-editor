"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { DocxOptions } from "@/types/options";
import { defaultOptions } from "@/types/options";

// 모든 컴포넌트를 SSR 없이 클라이언트 전용으로 로드 (DOMParser 등 브라우저 API 사용)
const TipTapEditor = dynamic(() => import("@/components/Editor/TipTapEditor"), { ssr: false });
const HeadingSymbolSelector = dynamic(() => import("@/components/Editor/HeadingSymbolSelector"), { ssr: false });
const AnnotationModeSelector = dynamic(() => import("@/components/Editor/AnnotationModeSelector"), { ssr: false });
const DocxPreview = dynamic(() => import("@/components/Preview/DocxPreview"), { ssr: false });
const OptionsPanel = dynamic(() => import("@/components/Options/OptionsPanel"), { ssr: false });
const DocxExporter = dynamic(() => import("@/components/Export/DocxExporter"), { ssr: false });

export default function Home() {
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
