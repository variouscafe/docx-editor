/**
 * 빌트인 문서 템플릿 프리셋 — DB 행 없이 FE 드롭다운에 표시.
 * 사용자 커스텀 템플릿(GET /api/templates)과 병합해 사용.
 * ReportTemplateRow 와 통합 shape — builtin:true 만 FE-only 판별자.
 */
import { DocxOptions, defaultOptions } from "./options";
import { LineStartSymbol } from "./lineStartSymbol";
import type { TemplateVisibility } from "./report";

export interface ReportTemplate {
  id: string;
  name: string;
  options: DocxOptions;
  builtin: boolean;
  visibility: TemplateVisibility;
  isOwner: boolean;
  isDefault?: boolean;
}

function withOverrides(overrides: Partial<DocxOptions>): DocxOptions {
  return { ...defaultOptions, ...overrides };
}

export const BUILTIN_TEMPLATES: ReportTemplate[] = [
  {
    id: "builtin:default",
    name: "기본 양식",
    options: defaultOptions,
    builtin: true,
    visibility: "public",
    isOwner: false,
    isDefault: false,
  },
  {
    id: "builtin:report",
    name: "보고서 양식",
    options: withOverrides({
      h1: {
        ...defaultOptions.h1,
        lineStartSymbol: LineStartSymbol.NUMBER_PAREN,
      },
    }),
    builtin: true,
    visibility: "public",
    isOwner: false,
    isDefault: false,
  },
];
