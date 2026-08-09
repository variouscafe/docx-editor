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

export const TableCellFormat = TableCellBackground.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      format: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-format") || null,
        renderHTML: (attributes) => (attributes.format ? { "data-format": attributes.format } : {}),
      },
      formula: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-formula") || null,
        renderHTML: (attributes) =>
          attributes.formula ? { "data-formula": attributes.formula } : {},
      },
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
