// @vitest-environment jsdom
/**
 * 표 계산 플러그인 엔드투엔드 검증(실제 TipTap Editor + jsdom).
 *  - 포맷 적용 시 표 구조 보존 + 셀 텍스트 포맷
 *  - 수식(SUM(ABOVE)) 적용 시 구조 보존 + 계산값
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCellFormat } from "./tableCellFormat";
import { TableFormulaPlugin } from "./tableFormulaPlugin";
import { insertTotalsRow } from "./tableTotalsRow";
import { duplicateTable } from "./tableActions";
import { TextSelection } from "@tiptap/pm/state";
import { DOMParser } from "@tiptap/pm/model";
import type { Node as PmNode } from "@tiptap/pm/model";

const DOC = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "항목" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "금액" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "10000" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "20000" }] }] },
          ],
        },
      ],
    },
  ],
};

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCellFormat,
      TableFormulaPlugin,
    ],
    content: DOC,
  });
}

/** 빈 문단 1개 문서 에디터(스키마 파싱 검증용). */
function blankEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCellFormat,
      TableFormulaPlugin,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function textPos(doc: PmNode, text: string): number {
  let r = -1;
  doc.descendants((n, p) => {
    if (r < 0 && n.isText && n.text === text) {
      r = p;
      return false;
    }
    return true;
  });
  return r;
}

function setCursor(editor: Editor, pos: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function countNodes(doc: PmNode, name: string): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === name) n++;
    return true;
  });
  return n;
}

describe("표 계산 플러그인 (엔드투엔드)", () => {
  it("setCellFormat(currencyWon) → 셀 텍스트 포맷 + 표 구조 보존", () => {
    const editor = makeEditor();
    const pos = textPos(editor.state.doc, "10000");
    setCursor(editor, pos);
    editor.chain().focus().setCellFormat("currencyWon").run();

    const doc = editor.state.doc;
    // 구조 보존(표 1, 행 3, 셀 4, 헤더 2)
    expect(countNodes(doc, "table")).toBe(1);
    expect(countNodes(doc, "tableRow")).toBe(3);
    expect(countNodes(doc, "tableCell")).toBe(4);
    expect(countNodes(doc, "tableHeader")).toBe(2);
    // 포맷 적용
    expect(doc.textContent).toContain("10,000원");
    editor.destroy();
  });

  it("setCellFormula(SUM(ABOVE)) → 합계 계산 + 구조 보존", () => {
    const editor = makeEditor();
    // 마지막 행 금액 셀(20000)에 SUM(ABOVE) → 위쪽 10000 합 = ₩10,000
    const pos = textPos(editor.state.doc, "20000");
    setCursor(editor, pos);
    editor.chain().focus().setCellFormula("SUM(ABOVE)").setCellFormat("currency").run();

    const doc = editor.state.doc;
    expect(countNodes(doc, "table")).toBe(1);
    expect(countNodes(doc, "tableRow")).toBe(3);
    expect(countNodes(doc, "tableCell")).toBe(4);
    expect(doc.textContent).toContain("₩10,000");
    editor.destroy();
  });

  it("모든 숫자 셀에 금액 포맷 일괄 적용해도 구조 유지", () => {
    const editor = makeEditor();
    // 10000 셀
    setCursor(editor, textPos(editor.state.doc, "10000"));
    editor.chain().focus().setCellFormat("currency").run();
    // 20000 셀
    setCursor(editor, textPos(editor.state.doc, "20000"));
    editor.chain().focus().setCellFormat("currency").run();

    const doc = editor.state.doc;
    expect(countNodes(doc, "tableCell")).toBe(4);
    expect(doc.textContent).toContain("₩10,000");
    expect(doc.textContent).toContain("₩20,000");
    editor.destroy();
  });

  it("표현식 수식(B3*1.1) → 사칙연산 계산 + 구조 보존", () => {
    const editor = makeEditor();
    // B2 셀(10000)에 표현식 수식 설정 → B3(20000)*1.1 = 22000
    setCursor(editor, textPos(editor.state.doc, "10000"));
    editor.chain().focus().setCellFormula("B3*1.1").setCellFormat("currency").run();

    const doc = editor.state.doc;
    expect(countNodes(doc, "table")).toBe(1);
    expect(countNodes(doc, "tableCell")).toBe(4);
    expect(doc.textContent).toContain("₩22,000");
    editor.destroy();
  });

  it("insertTotalsRow → 숫자 열(금액)에 SUM(ABOVE) 합계 행 추가", () => {
    const editor = makeEditor();
    setCursor(editor, textPos(editor.state.doc, "10000")); // 표 안
    insertTotalsRow(editor);

    const doc = editor.state.doc;
    expect(countNodes(doc, "tableRow")).toBe(4); // +1 합계 행
    expect(countNodes(doc, "tableCell")).toBe(6); // 기존 4 + 합계 행 2
    // 금액 열 합계 = 10000 + 20000 = 30000. 열에 포맷이 없으니 천단위 콤마(number) — ₩ 없음.
    expect(doc.textContent).toContain("30,000");
    editor.destroy();
  });

  it("insertTotalsRow — 열 포맷 추론(기존 셀이 currency면 합계도 currency)", () => {
    const editor = makeEditor();
    setCursor(editor, textPos(editor.state.doc, "10000"));
    editor.chain().focus().setCellFormat("currency").run();
    setCursor(editor, textPos(editor.state.doc, "20000"));
    editor.chain().focus().setCellFormat("currency").run();
    // 재계산으로 10000→₩10,000. 그 위치에서 합계행 추가.
    setCursor(editor, textPos(editor.state.doc, "₩10,000"));
    insertTotalsRow(editor);
    // 열 포맷 추론 → 합계도 currency → ₩30,000
    expect(editor.state.doc.textContent).toContain("₩30,000");
    editor.destroy();
  });

  it("insertTotalsRow — 위 소계(formula) 셀 이중 계산 방지", () => {
    const editor = makeEditor();
    // 20000 자리를 소계로: SUM(ABOVE) → 위 10000 = 10,000
    setCursor(editor, textPos(editor.state.doc, "20000"));
    editor.chain().focus().setCellFormula("SUM(ABOVE)").setCellFormat("number").run();
    // 재계산으로 20000 → 10,000. 그 위치에서 합계행 추가.
    setCursor(editor, textPos(editor.state.doc, "10,000"));
    insertTotalsRow(editor);
    // 합계행 SUM(ABOVE): 소계(formula) 셀을 skip → 위 데이터(10000)만 = 10,000.
    // 이중 계산이면 소계 표시값(10,000)+10000 = 20,000.
    const doc = editor.state.doc;
    expect((doc.textContent.match(/10,000/g) || []).length).toBe(2); // 소계 + 합계
    expect(doc.textContent).not.toContain("20,000");
    editor.destroy();
  });

  it("clearCellFormula → 수식 해제(formula attr null), 구조 보존", () => {
    const editor = makeEditor();
    setCursor(editor, textPos(editor.state.doc, "20000"));
    editor.chain().focus().setCellFormula("SUM(ABOVE)").setCellFormat("currency").run();
    expect(editor.state.doc.textContent).toContain("₩10,000");

    // 재계산으로 텍스트가 바뀌었으므로 셀 위치로 커서 재설정 후 해제(실제 앱: 셀 클릭 후 지우기).
    setCursor(editor, textPos(editor.state.doc, "₩10,000"));
    editor.chain().focus().clearCellFormula().run();

    const doc = editor.state.doc;
    expect(countNodes(doc, "tableCell")).toBe(4);
    // 모든 셀에서 formula attr 제거 확인
    let hasFormula = false;
    doc.descendants((n) => {
      if (
        (n.type.name === "tableCell" || n.type.name === "tableHeader") &&
        n.attrs?.formula
      ) {
        hasFormula = true;
        return false;
      }
      return true;
    });
    expect(hasFormula).toBe(false);
    editor.destroy();
  });

  it("duplicateTable → 표 복제(동일 내용의 표 추가, 구조 보존)", () => {
    const editor = makeEditor();
    setCursor(editor, textPos(editor.state.doc, "10000"));
    duplicateTable(editor);

    const doc = editor.state.doc;
    expect(countNodes(doc, "table")).toBe(2); // 복제본 추가
    // 원본 + 복제본 모두 10000 포함
    expect((doc.textContent.match(/10000/g) || []).length).toBe(2);
    expect((doc.textContent.match(/20000/g) || []).length).toBe(2);
    editor.destroy();
  });

  it("복사 HTML → 스키마 파싱 → 표 노드 복원(붙여넣기 복원 근간)", () => {
    // 붙여넣기(tableEditing.handlePaste)는 클립보드 HTML 을 스키마 DOMParser 로 파싱.
    // 우리가 복사로 만드는 <table> HTML 이 표 노드로 파싱되는지 검증.
    const editor = blankEditor();
    const schema = editor.schema;
    const html =
      '<table><tbody>' +
      '<tr><th>항목</th><th>금액</th></tr>' +
      '<tr><td>A</td><td>10000</td></tr>' +
      '<tr><td>B</td><td>20000</td></tr>' +
      "</tbody></table>";
    const div = document.createElement("div");
    div.innerHTML = html;
    const parsed = DOMParser.fromSchema(schema).parse(div) as PmNode;

    let tables = 0;
    parsed.descendants((n) => {
      if (n.type.name === "table") tables++;
      return true;
    });
    expect(tables).toBe(1);
    expect(parsed.textContent).toContain("10000");
    expect(parsed.textContent).toContain("20000");
    editor.destroy();
  });
});
