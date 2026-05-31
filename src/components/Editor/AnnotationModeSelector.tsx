import type { DocxOptions } from "../../types/options";

interface AnnotationModeSelectorProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

export default function AnnotationModeSelector({ options, onOptionsChange }: AnnotationModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">꼬마글씨</span>
      <select
        className="h-6 px-1.5 text-xs border border-gray-300 rounded bg-white"
        value={options.annotationMode}
        onChange={(e) => {
          onOptionsChange({
            ...options,
            annotationMode: Number(e.target.value) as 1 | 2,
          });
        }}
      >
        <option value={1}>꼬마글씨1 (인라인)</option>
        <option value={2}>꼬마글씨2 (단락)</option>
      </select>
    </div>
  );
}
