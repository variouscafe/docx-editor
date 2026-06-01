"use client";
import { Download } from "lucide-react";
import type { DocxOptions } from "../../types/options";
import { exportToDocx } from "../../utils/docxGenerator";

interface DocxExporterProps {
  html: string;
  options: DocxOptions;
}

export default function DocxExporter({ html, options }: DocxExporterProps) {
  const handleExport = async () => {
    try {
      await exportToDocx(html, options);
    } catch (err) {
      console.error("DOCX export failed:", err);
      alert("DOCX 내보내기에 실패했습니다:\n" + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
    >
      <Download size={16} />
      Export DOCX
    </button>
  );
}
