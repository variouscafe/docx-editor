import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { buildTableGrid, formatCellValue, type TableGrid } from "@shared/tableFormula";

/**
 * 표 계산 반응형 플러그인.
 *  1) appendTransaction — 모든 표를 순회하며 format/formula 셀의 표시 텍스트를 shared 엔진 결과로
 *     동기화. 공통 로직(BE 와 동일)으로 "미리보기 == DOCX". 값이 변한 셀만 갱신 → 무한루프 없음.
 *     단, 포맷(수식 아님) 셀 중 현재 편집 중(셀렉션 내부)인 셀은 스킵 → 타이핑 중 자동 포맷이
 *     입력을 방해하지 않는다(셀 이탈 시 snap). 포맷 방금 적용한 직후엔 즉시 반영.
 *  2) handleTextInput/Paste/Drop — 수식 셀(formula attr)은 읽기전용. 텍스트 입력 차단.
 *
 * 위치 계산은 doc.nodesBetween 의 **절대 위치**만 사용(상대 offset 산정의 오프바이원 회피).
 * 수식 셀의 표시 텍스트 = 파생값(진실의 원본은 cell.attrs.formula). 재계산 트랜잭션은 cellCalc 메타.
 */

const KEY = new PluginKey("tableFormula");
const META = "cellCalc";

interface CellUpdate {
  pos: number; // 셀 노드 직전 절대 위치
  size: number; // 셀 노드 크기
  desired: string;
  paraAttrs: Record<string, unknown>;
}

function selectionInsideCell(selection: { from: number; to: number }, pos: number, size: number): boolean {
  const { from, to } = selection;
  return from > pos && from < pos + size && to > pos && to < pos + size;
}

export const TableFormulaPlugin = Extension.create({
  name: "tableFormulaPlugin",
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        appendTransaction: (_transactions, oldState, newState) => {
          const doc = newState.doc;
          const sel = newState.selection;
          const oldDoc = oldState.doc;

          // 표별 그리드(범위 [start,end) 와 함께).
          const tables: { start: number; end: number; grid: TableGrid }[] = [];
          doc.nodesBetween(0, doc.content.size, (node, pos) => {
            if (node.type.name === "table") {
              tables.push({ start: pos, end: pos + node.nodeSize, grid: buildTableGrid(node.toJSON()) });
              return false;
            }
            return true;
          });
          if (tables.length === 0) return null;

          // 모든 셀을 절대 위치로 수집(문서 순서 = grid.cells 순서와 동일).
          const cellsAbs: { pos: number; node: any }[] = [];
          doc.nodesBetween(0, doc.content.size, (node, pos) => {
            if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
              cellsAbs.push({ pos, node });
              return false;
            }
            return true;
          });

          const tableIdx = new Map<number, number>(); // table.start → 다음 셀 인덱스
          const updates: CellUpdate[] = [];
          for (const c of cellsAbs) {
            const t = tables.find((tb) => c.pos > tb.start && c.pos < tb.end);
            if (!t) continue;
            const i = tableIdx.get(t.start) ?? 0;
            tableIdx.set(t.start, i + 1);
            const gc = t.grid.cells[i];
            if (!gc) continue;
            const hasCalc = !!gc.formula || !!gc.format;
            if (!hasCalc) continue;

            const desired = formatCellValue(gc, t.grid);
            if (desired === gc.text) continue;

            // 포맷(수식 아님) 셀이 편집 중이면 스킵(타이핑 보호).
            // 단, 방금 포맷 attr 이 바뀐 직후면 즉시 반영.
            if (!gc.formula && gc.format) {
              if (selectionInsideCell(sel, c.pos, c.node.nodeSize)) {
                const oldCell = oldDoc.nodeAt(c.pos);
                const justChanged =
                  oldCell &&
                  (oldCell as any).attrs &&
                  (oldCell as any).attrs.format !== c.node.attrs?.format;
                if (!justChanged) continue;
              }
            }

            const firstChild = c.node.firstChild;
            const paraAttrs =
              firstChild && firstChild.type.name === "paragraph" ? { ...firstChild.attrs } : {};

            updates.push({ pos: c.pos, size: c.node.nodeSize, desired, paraAttrs });
          }

          if (updates.length === 0) return null;

          const tr = newState.tr.setMeta(META, true);
          updates.sort((a, b) => b.pos - a.pos); // 위치 역순(앞쪽 위치 보존)
          const schema = tr.doc.type.schema;
          for (const u of updates) {
            const start = u.pos + 1; // 셀 내부 첫 자식 직전(절대)
            const end = u.pos + u.size - 1; // 셀 닫기 직전(절대)
            const textNode = u.desired === "" ? null : schema.text(u.desired);
            const para = schema.nodes.paragraph.create(u.paraAttrs, textNode ? [textNode] : []);
            tr.replaceWith(start, end, para);
          }
          return tr;
        },

        props: {
          // 수식 셀은 읽기전용 — 텍스트 입력/붙여넣기/드롭 차단.
          handleTextInput: (view) => enclosingFormulaCell(view.state),
          handlePaste: (view) => enclosingFormulaCell(view.state),
          handleDrop: (view) => enclosingFormulaCell(view.state),
          handleKeyDown: (view, event) => {
            const editing = enclosingFormulaCell(view.state);
            if (!editing) return false;
            const k = event.key;
            if (k.length === 1 || k === "Backspace" || k === "Delete" || k === "Enter") {
              if (event.metaKey || event.ctrlKey) return false; // 복사 등은 허용
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/** 현재 셀렉션이 수식(formula) 셀 안에 있으면 true. */
function enclosingFormulaCell(state: any): boolean {
  const { $from, $to } = state.selection;
  return isFormulaAt($from) || isFormulaAt($to);
}

function isFormulaAt($pos: any): boolean {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      return !!node.attrs?.formula;
    }
  }
  return false;
}
