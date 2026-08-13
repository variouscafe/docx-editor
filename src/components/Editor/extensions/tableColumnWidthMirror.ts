import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * 표 열 너비 미러(display:contents → colgroup 무력화 우회).
 *
 * 왜 분리했나 — 기존엔 measurePagination 이 매 트랜잭션(텍스트 입력 포함)마다 모든 표의 모든
 * 셀 inline style 을 재대입했다. 직전 width→flex-grow 변경으로 이게 실제 flex relayout 을 매
 * 입력마다 유발해 표가 흔들리고 잔상이 생겼다.
 *
 * 열 너비는 표 구조/colgroup 이 바뀔 때만 변한다(텍스트 편집은 colgroup 을 안 건드림). 그래서
 * 별도 플러그인에서 colgroup signature diff 로 **바뀐 표에만**, 그리고 셀별 diff 로 **바뀐 셀에만**
 * flex-grow 를 적용한다. 텍스트 편집엔 colgroup 동일 → no-op → reflow/재합성 없음 → 흔들림·잔상 소멸.
 *
 * 배경 — 표는 display:contents 로 렌더되어 colgroup 이 무력화되고, 각 <tr> 는 flex, 셀은 flex:1 1 0
 * (flex-basis:0). flexbox 스펙상 flex-basis 가 0이면 width 속성이 무시되고 오직 flex-grow 비율로만
 * 너비가 정해진다. 따라서 colgroup col 의 px 너비(또는 균등 가중치 1)를 셀의 flex-grow 로 반영한다.
 */
export const TableColumnWidthMirror = Extension.create({
  name: "tableColumnWidthMirror",

  addProseMirrorPlugins() {
    const tableSig = new WeakMap<Element, string>();
    const sync = (view: EditorView) => syncTableColumnWidths(view, tableSig);
    return [
      new Plugin({
        // 생성 직후 1회 + 매 트랜잭션 후. colgroup 이 같으면 내부에서 no-op.
        view: (view: EditorView) => {
          sync(view);
          return { update: sync };
        },
      }),
    ];
  },
});

/**
 * 각 표의 signature(열 수 + 각 col style.width + rowspan 여부)가 바뀐 경우에만 처리.
 * signature 같으면(=텍스트 편집 등) 아무것도 안 함.
 *
 * rowspan 포함 표는 wrapper 에 `rm-table-rowspan` 클래스를 부여(previewStyles 가 display:table
 * 진짜 레이아웃으로 전환 → rowspan 시각 지원). 이 표는 flex-grow 적용을 스킵(display:table 에선
 * colgroup 이 열 너비를 담당). rowspan 없는 표만 기존 flex-grow 미러.
 */
export function syncTableColumnWidths(view: EditorView, tableSig: WeakMap<Element, string>): void {
  const wrappers = view.dom.querySelectorAll<HTMLElement>(".tableWrapper");
  wrappers.forEach((wrapper) => {
    const cols = Array.from(wrapper.querySelectorAll<HTMLElement>("colgroup col"));
    // rowspan 속성은 PM 이 rowspan="1"(기본값) 도 렌더할 수 있으므로, 값이 1 초과인 셀만 판별.
    let hasRowspan = false;
    wrapper.querySelectorAll<HTMLElement>("td[rowspan], th[rowspan]").forEach((el) => {
      if ((parseInt(el.getAttribute("rowspan") || "1", 10) || 1) > 1) hasRowspan = true;
    });
    const sig = `${cols.length}:${cols.map((c) => c.style.width).join(",")}|rs=${hasRowspan}`;
    if (tableSig.get(wrapper) === sig) return; // 변화 없음 → skip(레이아웃 트리거 아님)
    tableSig.set(wrapper, sig);
    wrapper.classList.toggle("rm-table-rowspan", hasRowspan);
    if (!hasRowspan) applyToWrapper(wrapper); // rowspan 표는 display:table → flex-grow 스킵
  });
}

/** 열별 가중치. colgroup 에 명시 px 가 있으면 px, 없으면 균등(1). 단위 테스트용 export. */
export function computeWeights(cols: HTMLElement[]): number[] {
  const hasExplicit = cols.some((c) => parseInt(c.style.width, 10) > 0);
  return cols.map((c) => (hasExplicit ? parseInt(c.style.width, 10) || 0 : 1));
}

/**
 * 하나의 표에 열 너비를 flex-grow 로 적용. **diff**: 현재 style.flexGrow 와 계산값이 다른 셀만
 * set → 같으면 inline style 을 건드리지 않아 relayout 트리거가 없다.
 */
export function applyToWrapper(wrapper: HTMLElement): void {
  const cols = Array.from(wrapper.querySelectorAll<HTMLElement>("colgroup col"));
  if (!cols.length) return;
  const weights = computeWeights(cols);
  const rows = wrapper.querySelectorAll<HTMLElement>("tbody > tr");
  rows.forEach((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    let col = 0;
    for (const cell of cells) {
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
      let w = 0;
      for (let j = 0; j < colspan; j++) w += weights[col + j] || 0;
      const want = String(w > 0 ? w : 1);
      if (cell.style.flexGrow !== want) cell.style.flexGrow = want; // diff set
      if (cell.style.width !== "") cell.style.width = ""; // width(flex:1 1 0 가 무시) 정리 1회
      col += colspan;
    }
  });
}
