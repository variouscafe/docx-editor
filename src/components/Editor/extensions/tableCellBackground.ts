import { TableCell } from "@tiptap/extension-table-cell";

/**
 * TableCell + 셀 배경음영(background) 속성.
 * boxBorder 패턴(data-* 속성 + CSS)을 따른다 — 인라인 style 은 표 기본 align(text-align)
 * 렌더와 충돌하므로 쓰지 않고, 색은 data-background 에 담아 getPreviewStyles 의 CSS 가 해석.
 * 배경 적용은 표 확장의 setCellAttribute 로 다중 셀 선택까지 처리.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableCellBackground: {
      setCellBackground: (color: string) => ReturnType;
      unsetCellBackground: () => ReturnType;
    };
  }
}

export const TableCellBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      background: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-background") || null,
        renderHTML: (attributes) =>
          attributes.background ? { "data-background": attributes.background } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCellBackground:
        (color: string) =>
        ({ commands }) =>
          commands.setCellAttribute("background", color),
      unsetCellBackground:
        () =>
        ({ commands }) =>
          commands.setCellAttribute("background", null),
    };
  },
});
