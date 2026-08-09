import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { buildTableGrid, formatCellValue, type GridCell } from "@shared/tableFormula";

/**
 * 표 계산 반응형 플러그인.
 *  1) appendTransaction — 모든 표를 순회하며 format/formula 셀의 표시 텍스트를 shared 엔진 결과로
 *     동기화. 공통 로직(BE 와 동일)으로 "미리보기 == DOCX". 값이 변한 셀만 갱신 → 무한루프 없음.
 *     단, 포맷(수식 아님) 셀 중 현재 편집 중(셀렉션 내부)인 셀은 스킵 → 타이핑 중 자동 포맷이
 *     입력을 방해하지 않는다(셀 이탈 시 snap). 포맷 방금 적용한 직후엔 즉시 반영.
 *  2) handleTextInput/Paste/Drop — 수식 셀(formula attr)은 읽기전용. 텍스트 입력 차단.
 *     (수식은 버블메뉴 계산식 에디터로만 변경)
 *
 * 수식 셀의 표시 텍스트 = 파생값. 진실의 원본은 cell.attrs.formula. 재계산 트랜잭션은
 * cellCalc 메타로 표시해 다른 가드와 충돌하지 않는다.
 */

const KEY = new PluginKey("tableFormula");
const META = "cellCalc";

interface CellUpdate {
  pos: number; // 셀 노드 직전 위치(절대)
  size: number; // 셀 노드 크기
  desired: string;
  paraAttrs: Record<string, unknown>;
}

/** 표 노드 내 셀(tableCell/tableHeader)을 문서 순으로 (절대위치, 노드) 수집. */
function collectCells(
  tableNode: { type: { name: string }; nodeSize: number },
  tablePos: number,
  nodesBetween: (
    from: number,
    to: number,
    fn: (node: any, pos: number) => boolean | void,
  ) => void,
): { pos: number; node: any }[] {
  const out: { pos: number; node: any }[] = [];
  nodesBetween(0, (tableNode as any).content.size, (node: any, relPos: number) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      out.push({ pos: tablePos + relPos, node });
      return false; // 셀 내부는 미탐색
    }
    return true;
  });
  return out;
}

function selectionInsideCell(selection: any, pos: number, size: number): boolean {
  const from = selection.from;
  const to = selection.to;
  return from > pos && from < pos + size && to > pos && to < pos + size;
}

export const TableFormulaPlugin = Extension.create({
  name: "tableFormulaPlugin",
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        appendTransaction: (transactions, oldState, newState) => {
          const doc = newState.doc;
          const sel = newState.selection;
          const oldDoc = oldState.doc;
          const updates: CellUpdate[] = [];

          doc.nodesBetween(0, doc.content.size, (node, pos) => {
            if (node.type.name !== "table") return true;
            // 표 내부는 여기서 직접 순회(nodesBetween 중복 진입 방지)
            const grid = buildTableGrid(node.toJSON());
            const cellInfos = collectCells(
              node,
              pos,
              (from, to, fn) => node.nodesBetween(from, to, fn),
            );

            cellInfos.forEach((info, i) => {
              const gc: GridCell | undefined = grid.cells[i];
              if (!gc) return;
              const hasCalc = !!gc.formula || !!gc.format;
              if (!hasCalc) return;

              const desired = formatCellValue(gc, grid);
              if (desired === gc.text) return; // 변화 없음

              // 포맷(수식 아님) 셀이 편집 중이면 스킵(타이핑 보호).
              // 단, 방금 포맷 attr 이 바뀐 직후면 즉시 반영.
              if (!gc.formula && gc.format) {
                const inside = selectionInsideCell(sel, info.pos, info.node.nodeSize);
                if (inside) {
                  const oldCell = oldDoc.nodeAt(info.pos);
                  const justChanged =
                    oldCell &&
                    (oldCell as any).attrs &&
                    (oldCell as any).attrs.format !== info.node.attrs?.format;
                  if (!justChanged) return;
                }
              }

              // 첫 단락의 속성(textAlign 등) 보존.
              const firstChild = info.node.firstChild;
              const paraAttrs =
                firstChild && firstChild.type.name === "paragraph"
                  ? { ...firstChild.attrs }
                  : {};

              updates.push({
                pos: info.pos,
                size: info.node.nodeSize,
                desired,
                paraAttrs,
              });
            });

            return false; // 표 하위는 처리했으니 더 내려가지 않음
          });

          if (!updates.length) return null;

          const tr = newState.tr.setMeta(META, true);
          // 위치 역순 적용(앞쪽 위치 보존).
          updates.sort((a, b) => b.pos - a.pos);
          const schema = tr.doc.type.schema;
          for (const u of updates) {
            const start = u.pos + 1; // 셀 내부 첫 자식 직전
            const end = u.pos + u.size - 1; // 셀 닫기 직전
            const textNode = u.desired === "" ? null : schema.text(u.desired);
            const para = schema.nodes.paragraph.create(u.paraAttrs, textNode ? [textNode] : []);
            tr.replaceWith(start, end, para);
          }
          return tr;
        },

        props: {
          // 수식 셀은 읽기전용 — 텍스트 입력/붙여넣기/드롭 차단.
          handleTextInput: (view, from) => {
            return enclosingFormulaCell(view.state);
          },
          handlePaste: (view) => {
            return enclosingFormulaCell(view.state);
          },
          handleDrop: (view) => {
            return enclosingFormulaCell(view.state);
          },
          handleKeyDown: (view, event) => {
            // 수식 셀 안에서의 편집성 키(문자 생성·삭제) 차단. 이동/복사는 허용.
            const editing = enclosingFormulaCell(view.state);
            if (!editing) return false;
            const k = event.key;
            if (k.length === 1 || k === "Backspace" || k === "Delete" || k === "Enter") {
              // meta/ctrl 조합(복사/붙여넣기 등)은 OS 단에서 별도 처리되므로 여기선 단순 문자/삭제만.
              if (event.metaKey || event.ctrlKey) return false;
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
