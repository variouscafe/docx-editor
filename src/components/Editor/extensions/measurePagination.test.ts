// @vitest-environment jsdom
/**
 * MeasurePagination 순수 로직 단위 테스트 — rowHasHeader(헤더 행 판정) 와 paginate(그리디 배치).
 *
 * 핵심 회귀: 헤더 "열"(toggleHeaderColumn) 표에서 모든 데이터 행의 첫 셀이 tableHeader 라
 * ANY 판정이면 데이터 행까지 헤더로 취급되어 연속 페이지에 "반복 헤더"로 복제되고,
 * paginate 도 반복 헤더 높이(headerExtra) 만큼 used 를 잘못 더했다.
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import type { Node as PmNode } from "@tiptap/pm/model";
import { paginate, rowHasHeader, type MeasuredBlock } from "./measurePagination";

const cell = (text: string) => ({
  type: "tableCell",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const headerCell = (text: string) => ({
  type: "tableHeader",
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

/** 문서의 첫 표 행들을 반환. */
function tableRows(editor: Editor): PmNode[] {
  const rows: PmNode[] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "table") node.forEach((row) => rows.push(row));
  });
  return rows;
}

/** paginate 단위 테스트용 목 블록 — 높이만 제어(마진 0). */
function rowBlock(i: number, height: number, tableId: number, isHeader: boolean): MeasuredBlock {
  return {
    pos: i,
    end: i + 1,
    node: {} as PmNode,
    marginTop: 0,
    marginBottom: 0,
    height,
    isTable: false,
    isHeader,
    tableId,
  };
}

describe("rowHasHeader — 전 셀이 tableHeader 일 때만 헤더 행", () => {
  it("일반 헤더 행(모두 th) → true, 데이터 행(td) → false", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [headerCell("A"), headerCell("B")] },
            { type: "tableRow", content: [cell("a"), cell("b")] },
          ],
        },
      ],
    });
    const rows = tableRows(editor);
    expect(rowHasHeader(rows[0])).toBe(true);
    expect(rowHasHeader(rows[1])).toBe(false);
    editor.destroy();
  });

  it("헤더 열 표(th + td 혼합 행) → 어떤 행도 헤더 행 아님", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [headerCell("구분"), cell("a"), cell("b")] },
            { type: "tableRow", content: [headerCell("구분2"), cell("c"), cell("d")] },
          ],
        },
      ],
    });
    const rows = tableRows(editor);
    expect(rowHasHeader(rows[0])).toBe(false);
    expect(rowHasHeader(rows[1])).toBe(false);
    editor.destroy();
  });
});

describe("paginate — 헤더 반복(headerExtra) 높이 배치", () => {
  it("헤더 열 표: 연속 페이지 데이터 행에 반복 헤더 높이가 끼어들지 않음", () => {
    // 헤더 열 표 → 어떤 행도 isHeader 아님(ALL 판정).
    const blocks = [
      rowBlock(0, 30, 1, false),
      rowBlock(1, 30, 1, false),
      rowBlock(2, 30, 1, false),
    ];
    const pages = paginate(blocks, 70); // 2행(60)까지만 한 페이지.
    expect(pages).toHaveLength(2);
    expect(pages[1].blocks[0]).toBe(blocks[2]);
    // 기존 ANY 판정 버그: 첫 데이터 행이 isHeader 로 headerHeights 에 등록되어
    // 연속 페이지 used 가 30+30=60 이 됐다. 정상은 반복 헤더 없이 30.
    expect(pages[1].used).toBe(30);
  });

  it("일반 헤더 행 표: 연속 페이지 첫 행 앞 반복 헤더 높이 선반영", () => {
    const blocks = [
      rowBlock(0, 30, 1, true), // 헤더 행
      rowBlock(1, 30, 1, false),
      rowBlock(2, 30, 1, false),
    ];
    const pages = paginate(blocks, 70);
    expect(pages).toHaveLength(2);
    expect(pages[1].blocks[0]).toBe(blocks[2]);
    // 반복 헤더(30) + 첫 데이터 행(30) = 60.
    expect(pages[1].used).toBe(60);
  });
});
