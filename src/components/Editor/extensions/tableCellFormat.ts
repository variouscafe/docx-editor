import TableHeader from "@tiptap/extension-table-header";
import { TableCellBackground } from "./tableCellBackground";
import type { NumberFormat } from "@shared/tableFormula";

/**
 * TableCell(← TableCellBackground) + 숫자 포맷(format)·계산식(formula) 속성.
 * tableCellBackground 를 체인 확장 → background 속성·명령도 함께 상속(단일 tableCell 노드).
 * 동일 패턴(data-* 속성 + setCellAttribute) — 인라인 style 은 표의 text-align 렌더와 충돌.
 * 다중 셀 선택까지 자동 지원.
 *
 * - format: 표시 포맷(number/currency/currencyWon/number2/percent/...). 셀 원문은 그대로.
 * - formula: 계산식(SUM(ABOVE), =SUM(B2:B8), …). 진실의 원본 — 표시 텍스트는 tableFormulaPlugin
 *   이 실시간으로 평가·동기화한다(BE 도 내보내기 시 동일 평가).
 * - rawValue: 표시 동기화 시점의 미포맷 원값 — 체인 수식이 포맷 반올림 표시값이 아니라
 *   원값을 참조하게 하는 내부 속성(사용자 편집 텍스트와 불일치 시 무시된다).
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableCellFormat: {
      setCellFormat: (format: NumberFormat) => ReturnType;
      clearCellFormat: () => ReturnType;
      setCellFormula: (formula: string) => ReturnType;
      clearCellFormula: () => ReturnType;
    };
  }
}

const calcAttrs = () => ({
  format: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-format") || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.format ? { "data-format": attributes.format as string } : {},
  },
  formula: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-formula") || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.formula ? { "data-formula": attributes.formula as string } : {},
  },
  rawValue: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const v = Number(element.getAttribute("data-raw-value"));
      return Number.isFinite(v) ? v : null;
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.rawValue != null
        ? { "data-raw-value": String(attributes.rawValue) }
        : {},
  },
});

export const TableCellFormat = TableCellBackground.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...calcAttrs(),
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCellFormat:
        (format: NumberFormat) =>
        ({ commands }) =>
          commands.setCellAttribute("format", format),
      clearCellFormat:
        () =>
        ({ commands }) =>
          commands.setCellAttribute("format", null),
      setCellFormula:
        (formula: string) =>
        ({ commands }) =>
          commands.setCellAttribute("formula", formula),
      clearCellFormula:
        () =>
        ({ commands }) =>
          commands.setCellAttribute("formula", null),
    };
  },
});

/**
 * TableHeader 에도 동일 계산 속성 — 헤더 셀에서 포맷/수식 적용·활성 표시가 동작하게.
 * (tiptap 기본 tableHeader 는 이 속성들이 없어 setCellAttribute 가 무시되고
 *  툴바 getAttributes("tableHeader") 도 항상 빈 값을 돌려줬다.)
 */
export const TableHeaderFormat = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...calcAttrs(),
    };
  },
});
