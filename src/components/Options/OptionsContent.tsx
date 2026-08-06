import type { DocxOptions } from "@shared/options";
import TemplateManager from "./TemplateManager";
import OptionsPanel from "./OptionsPanel";

interface OptionsContentProps {
  options: DocxOptions;
  templateId: string | null;
  /** 템플릿 적용 시 보고서 options(재정규화)·templateId 갱신. */
  onApply: (
    options: DocxOptions,
    templateId: string | null
  ) => void;
  onOptionsChange: (options: DocxOptions) => void;
}

/**
 * 우측 옵션 패널 본문 — 템플릿 관리(상단 고정) + 옵션(스크롤).
 * PC 인라인 aside 와 모바일 Sheet 양쪽에서 동일하게 재사용.
 */
export default function OptionsContent({
  options,
  templateId,
  onApply,
  onOptionsChange,
}: OptionsContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TemplateManager options={options} templateId={templateId} onApply={onApply} />
      <div className="min-h-0 flex-1">
        <OptionsPanel options={options} onOptionsChange={onOptionsChange} />
      </div>
    </div>
  );
}
