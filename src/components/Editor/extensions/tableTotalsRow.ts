import type { Editor } from "@tiptap/react";
import { buildTableGrid } from "@shared/tableFormula";

/**
 * 합계 행 자동 추가 — 현재 표의 숫자 열을 감지해 맨 아래에 합계 행을 한 번에 생성.
 * 숫자 열 셀: formula=SUM(ABOVE) + format=currency + 우측정렬. 비숫자 열: 빈 셀.
 * 셀 텍스트는 tableFormulaPlugin 이 appendTransaction 으로 실시간 산출(워드/엑셀 합계 행 느낌).
 * 병합 셀이 섞여도 논리 그리드 기반이라 안전.
 */
export function insertTotalsRow(editor: Editor): void {
  const state = editor.state;
  const view = editor.view;
  const schema = state.schema;

  // 선택 영역이 속한 표 찾기.
  let tablePos = -1;
  let tableNode: ReturnType<typeof Object> | null = null;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (node.type.name === "table") {
      tablePos = pos;
      tableNode = node as unknown as typeof Object;
      return false;
    }
    return true;
  });
  if (tablePos < 0 || !tableNode) return;

  const tableAny = tableNode as unknown as {
    nodeSize: number;
    toJSON: () => unknown;
  };
  const grid = buildTableGrid(tableAny.toJSON() as Parameters<typeof buildTableGrid>[0]);
  if (grid.cols === 0) return;

  // 열별 숫자 여부(헤더 제외, 숫자 셀이 하나라도 있으면 숫자 열).
  const numericCols: boolean[] = [];
  for (let c = 0; c < grid.cols; c++) {
    let numeric = false;
    for (let r = 0; r < grid.rows && !numeric; r++) {
      const cell = grid.matrix[r]?.[c];
      if (cell && !cell.isHeader && cell.value !== null) numeric = true;
    }
    numericCols.push(numeric);
  }

  const cells = numericCols.map((numeric) => {
    const attrs = numeric ? { formula: "SUM(ABOVE)", format: "currency" } : {};
    const para = schema.nodes.paragraph.create(numeric ? { textAlign: "right" } : {});
    return schema.nodes.tableCell.create(attrs, [para]);
  });
  const newRow = schema.nodes.tableRow.create(null, cells);

  // 표 닫기 직전(=마지막 행 뒤)에 새 행 삽입.
  const tr = state.tr.insert(tablePos + tableAny.nodeSize - 1, newRow);
  view.dispatch(tr);
  view.focus();
}
