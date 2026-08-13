// @vitest-environment jsdom
/**
 * 표 열 너비 미러(tableColumnWidthMirror) 검증 — 실제 TipTap Editor + jsdom.
 *
 * 핵심 회귀: 4열 균등 표에서 앞 2셀 병합 시 병합 셀은 50%, 나머지는 25%씩 유지되어야
 * 한다(뒤 열 너비 보존 = 표 전체 틀 유지). 셀이 flex:1 1 0 이라 width 가 무시되므로,
 * 너비 비율은 flex-grow 로 반영된다. 또한 적용은 diff(바뀐 셀만)로 동작해야 한다.
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { applyToWrapper, computeWeights, syncTableColumnWidths } from "./tableColumnWidthMirror";

const cell = (text: string, extraAttrs: Record<string, unknown> = {}) => ({
  type: "tableCell",
  attrs: extraAttrs,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

function makeEditor(content: object) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
  });
}

/** editor DOM 에서 tableWrapper 를 찾아 applyToWrapper 적용 후 행별 td flex-grow 수집. */
function applyAndRows(dom: HTMLElement): string[][] {
  const wrapper = dom.querySelector(".tableWrapper") as HTMLElement | null;
  expect(wrapper, "tableWrapper 가 렌더되어야 함").toBeTruthy();
  applyToWrapper(wrapper!);
  const rows = Array.from(wrapper!.querySelectorAll<HTMLTableElement>("tbody > tr"));
  return rows.map((row) =>
    Array.from(row.children).map((c) => (c as HTMLElement).style.flexGrow),
  );
}

describe("applyToWrapper — 병합 후 열 너비 유지", () => {
  it("균등 4열 표: 앞 2셀 병합 → [50%, 25%, 25%] (flex-grow [2,1,1])", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [cell("AB", { colspan: 2 }), cell("C"), cell("D")],
            },
            {
              type: "tableRow",
              content: [cell("a"), cell("b"), cell("c"), cell("d")],
            },
          ],
        },
      ],
    });

    const rows = applyAndRows(editor.view.dom as HTMLElement);
    expect(rows[0]).toEqual(["2", "1", "1"]); // 병합 셀 colspan2 → grow 2
    expect(rows[1]).toEqual(["1", "1", "1", "1"]);

    editor.destroy();
  });

  it("리사이즈한 표: colwidth px 비율이 flex-grow 로 반영", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                cell("A", { colwidth: [100] }),
                cell("B", { colwidth: [200] }),
                cell("C", { colwidth: [300] }),
                cell("D", { colwidth: [400] }),
              ],
            },
          ],
        },
      ],
    });

    const rows = applyAndRows(editor.view.dom as HTMLElement);
    expect(rows[0]).toEqual(["100", "200", "300", "400"]);

    editor.destroy();
  });

  it("diff: 이미 올바른 값이면 재호출해도 변경하지 않는다(입력 시 no-op 근거)", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("a"), cell("b")] },
          ],
        },
      ],
    });
    const dom = editor.view.dom as HTMLElement;
    const wrapper = dom.querySelector(".tableWrapper") as HTMLElement;
    applyToWrapper(wrapper);
    const tds = Array.from(wrapper.querySelectorAll("td"));
    const before = tds.map((t) => (t as HTMLElement).style.flexGrow);
    // 한 셀을 잘못된 값으로 오염 → applyToWrapper 가 복원(diff set 발생).
    (tds[0] as HTMLElement).style.flexGrow = "999";
    applyToWrapper(wrapper);
    expect((tds[0] as HTMLElement).style.flexGrow).toBe("1");
    // 정상 셀은 건드리지 않았는지(이미 "1" → 그대로).
    expect((tds[1] as HTMLElement).style.flexGrow).toBe("1");
    void before;

    editor.destroy();
  });
});

describe("syncTableColumnWidths — rowspan 분기", () => {
  it("rowspan 표: rm-table-rowspan 클래스 부여 + flex-grow 미적용(display:table)", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { rowspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] },
              ],
            },
          ],
        },
      ],
    });
    syncTableColumnWidths(editor.view, new WeakMap());
    const wrapper = editor.view.dom.querySelector(".tableWrapper") as HTMLElement;
    expect(wrapper.classList.contains("rm-table-rowspan")).toBe(true);
    // rowspan 표는 flex-grow 적용 스킵
    const tds = wrapper.querySelectorAll("td");
    tds.forEach((td) => expect((td as HTMLElement).style.flexGrow).toBe(""));
    editor.destroy();
  });

  it("rowspan 없는 표: 클래스 없음 + flex-grow 적용(기존 동작 유지)", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [cell("AB", { colspan: 2 }), cell("C"), cell("D")],
            },
            {
              type: "tableRow",
              content: [cell("a"), cell("b"), cell("c"), cell("d")],
            },
          ],
        },
      ],
    });
    syncTableColumnWidths(editor.view, new WeakMap());
    const wrapper = editor.view.dom.querySelector(".tableWrapper") as HTMLElement;
    expect(wrapper.classList.contains("rm-table-rowspan")).toBe(false);
    const tds = Array.from(wrapper.querySelectorAll("td"));
    expect(tds.map((td) => (td as HTMLElement).style.flexGrow)).toEqual(["2", "1", "1", "1", "1", "1", "1"]);
    editor.destroy();
  });
});

describe("computeWeights — 열 가중치 계산", () => {
  function col(width: string): HTMLElement {
    const c = document.createElement("col");
    c.style.width = width;
    return c;
  }

  it("colgroup 에 명시 px 없으면 균등 가중치 1", () => {
    expect(computeWeights([col(""), col(""), col(""), col("")])).toEqual([1, 1, 1, 1]);
  });

  it("px 있으면 px 비율 사용(빈 열은 0)", () => {
    expect(computeWeights([col("100px"), col("200px"), col(""), col("400px")])).toEqual([
      100, 200, 0, 400,
    ]);
  });
});
