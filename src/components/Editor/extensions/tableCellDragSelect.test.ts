// @vitest-environment jsdom
/**
 * TableCellDragSelect 터치 제스처 방향 판별 테스트.
 *
 * 핵심 회귀: 표 셀 위 touch-action:none + 무조건 preventDefault 였을 때 모바일에서
 * 표 위 세로 드래그로 문서 스크롤이 불가했다. 이제 세로 우세 드래그는 스크롤로 놔두고
 * (preventDefault 하지 않음) 가로 우세 드래그만 셀 선택(CellSelection)으로 처리한다.
 *
 * jsdom 은 TouchEvent 생성/elementFromPoint 를 지원하지 않으므로 touches 를 붙인
 * 일반 Event 로 디스패치하고 elementFromPoint 만 mock 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { CellSelection } from "@tiptap/pm/tables";
import { TableCellDragSelect } from "./tableCellDragSelect";

const cell = (text: string) => ({
  type: "tableCell",
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
      TableCellDragSelect,
    ],
    content,
  });
}

/** touches 가 붙은 가짜 터치 이벤트. */
function fakeTouch(type: "touchstart" | "touchmove" | "touchend", x: number, y: number): Event {
  const ev = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(ev, "touches", {
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
  });
  return ev;
}

/** 문서 DOM 에서 (row, col) td 요소. */
function tdAt(dom: HTMLElement, row: number, col: number): HTMLElement {
  const tds = dom.querySelectorAll(`tbody > tr:nth-child(${row + 1}) > td`);
  return tds[col] as HTMLElement;
}

function twoByTwoEditor() {
  return makeEditor({
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("a"), cell("b")] },
          { type: "tableRow", content: [cell("c"), cell("d")] },
        ],
      },
    ],
  });
}

/**
 * jsdom Document 는 elementFromPoint 미구현 → 직접 주입(스파이 불가).
 * 원복용으로 원본(=undefined) 을 기억해 테스트 뒤 삭제한다.
 */
function stubElementFromPoint(impl: (x: number, y: number) => Element | null): void {
  const d = document as Document & { elementFromPoint?: (x: number, y: number) => Element | null };
  d.elementFromPoint = impl as typeof document.elementFromPoint;
}

afterEach(() => {
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe("tableCellDragSelect — 방향 판별", () => {
  it("가로 우세 드래그(임계치 이상 |dx|>|dy|) → CellSelection 생성", () => {
    const editor = twoByTwoEditor();
    const dom = editor.view.dom as HTMLElement;
    const from = tdAt(dom, 0, 0);
    const to = tdAt(dom, 0, 1);
    // x<50 → 첫 열 셀, x>=50 → 둘째 열 셀.
    stubElementFromPoint((x: number) => (x < 50 ? from : to));

    dom.dispatchEvent(fakeTouch("touchstart", 10, 100));
    const move = fakeTouch("touchmove", 60, 104); // dx=50, dy=4 → 가로 우세
    dom.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true); // 제스처 억제
    expect(editor.view.state.selection instanceof CellSelection).toBe(true);

    dom.dispatchEvent(fakeTouch("touchend", 60, 104));
    editor.destroy();
  });

  it("세로 우세 드래그(|dy|>=|dx|) → 셀 선택 포기, preventDefault 하지 않음(스크롤 허용)", () => {
    const editor = twoByTwoEditor();
    const dom = editor.view.dom as HTMLElement;
    const start = tdAt(dom, 0, 0);
    stubElementFromPoint(() => start);

    dom.dispatchEvent(fakeTouch("touchstart", 10, 100));
    const move = fakeTouch("touchmove", 14, 160); // dx=4, dy=60 → 세로 우세
    dom.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false); // 브라우저 세로 스크롤 막지 않음
    expect(editor.view.state.selection instanceof CellSelection).toBe(false);

    // 이후 같은 터치에서 가로로 크게 움려도 이미 포기했으므로 선택 안 됨.
    const move2 = fakeTouch("touchmove", 120, 170);
    dom.dispatchEvent(move2);
    expect(editor.view.state.selection instanceof CellSelection).toBe(false);

    dom.dispatchEvent(fakeTouch("touchend", 120, 170));
    editor.destroy();
  });

  it("임계치 이하 이동(탭) → 선택 변경 없음", () => {
    const editor = twoByTwoEditor();
    const dom = editor.view.dom as HTMLElement;
    const start = tdAt(dom, 0, 0);
    stubElementFromPoint(() => start);

    const before = editor.view.state.selection;
    dom.dispatchEvent(fakeTouch("touchstart", 10, 100));
    const move = fakeTouch("touchmove", 14, 103); // 5px — 임계치(8px) 미만
    dom.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    expect(editor.view.state.selection.eq(before)).toBe(true);

    dom.dispatchEvent(fakeTouch("touchend", 14, 103));
    editor.destroy();
  });
});
