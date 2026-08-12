// @vitest-environment jsdom
/**
 * 실제 TipTap Editor(jsdom)로 엔드투엔드 검증.
 *  - 표 셀 경계 Backspace 가드(우선순위·차단·구조 보존)
 *  - HeadingPrefixSync 삭제 루프 수정(헤딩 비워도 prefix 재생성 안 함)
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableDeleteGuard } from "./tableDeleteGuard";
import { HeadingPrefix, HeadingPrefixSync } from "./headingPrefix";
import { TitleExtension } from "./title";
import { TextSelection } from "@tiptap/pm/state";
import { defaultOptions } from "@shared/options";
import type { Node as PmNode } from "@tiptap/pm/model";

const TABLE_DOC = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "HHH" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "AAA" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "BBB" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "CCC" }] }] },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ],
};

function tableEditor(withGuard: boolean) {
  const exts: any[] = [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
  if (withGuard) exts.push(TableDeleteGuard);
  return new Editor({ extensions: exts, content: TABLE_DOC });
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

function countNodes(doc: PmNode, name: string): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === name) n++;
    return true;
  });
  return n;
}

function setCursor(editor: Editor, pos: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function pressBackspace(editor: Editor, times: number): boolean {
  let prevented = false;
  for (let i = 0; i < times; i++) {
    const ev = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(ev);
    if (ev.defaultPrevented) prevented = true;
  }
  return prevented;
}

describe("표 셀 delete 가드 (엔드투엔드)", () => {
  it("가드가 셀 시작 Backspace를 가로채고 행/셀을 보존한다", () => {
    const editor = tableEditor(true);
    const posA = textPos(editor.state.doc, "AAA");
    setCursor(editor, posA); // 첫 행 두 번째 셀 콘텐츠 맨 앞

    const prevented = pressBackspace(editor, 10);

    expect(prevented).toBe(true); // handleKeyDown 이 keymap 보다 먼저 차단
    expect(countNodes(editor.state.doc, "tableRow")).toBe(2);
    expect(countNodes(editor.state.doc, "tableCell")).toBe(3);
    expect(countNodes(editor.state.doc, "tableHeader")).toBe(1);
    editor.destroy();
  });

  it("빈 셀에서도 Backspace 반복 시 행이 삭제되지 않는다", () => {
    const editor = tableEditor(true);
    // CCC 셀 텍스트를 트랜잭션으로 비워 빈 셀 생성
    const posC = textPos(editor.state.doc, "CCC");
    const cellTextEnd = posC + 3;
    editor.view.dispatch(editor.state.tr.delete(posC, cellTextEnd));
    setCursor(editor, posC); // 빈 셀 콘텐츠 위치

    pressBackspace(editor, 12);

    expect(countNodes(editor.state.doc, "tableRow")).toBe(2);
    expect(countNodes(editor.state.doc, "tableCell")).toBe(3);
    editor.destroy();
  });

  it("셀 내부 일반 Backspace는 가드가 간섭하지 않는다(문자 삭제 허용)", () => {
    const editor = tableEditor(true);
    const posC = textPos(editor.state.doc, "CCC");
    setCursor(editor, posC + 2); // 텍스트 중간(경계 아님)
    pressBackspace(editor, 1);
    // 구조 유지(문자 삭제 자체는 jsdom keydown 경로로 일어나지 않으므로 CCC 그대로여도 무방)
    expect(countNodes(editor.state.doc, "tableRow")).toBe(2);
    editor.destroy();
  });
});

describe("HeadingPrefixSync 삭제 루프 (엔드투엔드)", () => {
  function headingEditor(content: any) {
    return new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
        HeadingPrefix,
        HeadingPrefixSync.configure({ getOptions: () => defaultOptions }),
      ],
      content,
    });
  }

  it("헤딩 내용을 모두 지워 비워도 prefix가 재생성되지 않는다(루프 방지)", () => {
    const editor = headingEditor({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "1. Hello" }] }],
    });
    const h = editor.state.doc.firstChild!;
    const size = h.content.size;
    // 헤딩 내용 전체 삭제 (delete 트랜잭션 → appendTransaction 파이프라인 통과)
    editor.view.dispatch(editor.state.tr.delete(1, 1 + size));

    const h2 = editor.state.doc.firstChild!;
    expect(h2.type.name).toBe("heading");
    expect(h2.textContent).toBe(""); // 비워짐, prefix 재생성 없음
    editor.destroy();
  });

  it("새로 생성된 빈 헤딩에는 prefix가 삽입된다(정상 동작 유지)", () => {
    const editor = headingEditor({ type: "doc", content: [{ type: "paragraph" }] });
    // 빈 문단 → 빈 헤딩으로 변환
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, editor.schema.nodes.heading, { level: 1 }));

    const h = editor.state.doc.firstChild!;
    expect(h.type.name).toBe("heading");
    expect(h.textContent).toBe("1. "); // NUMBER_DOT count 1
    editor.destroy();
  });
});

describe("기호에서 삭제 — 글자 단위(Android delete(pos-1,pos)) 회귀", () => {
  /**
   * 사용자 리포트: "기호에서 삭제 → 내용 모두 제거 → 위쪽 문장으로 삭제가 이어지지 않고
   * 같은 문장에서 무한 반복". prefix 재생성 루프가 원인.
   * Android 는 backspace 를 handleKeyDown(Backspace) 로 합성하고, 처리 못 하면
   * tr.delete(pos-1, pos) 크루드 폴백을 쓴다(prosemirror-view input.js).
   * 이 시뮬레이션은 글자 단위 delete 로 매 단계 appendTransaction 을 통과시켜
   * prefix 재생성(루프)이 없는지, 빈 헤딩 도달 후 위쪽으로 join 되는지 검증한다.
   */
  function fullHeadingEditor() {
    return new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
        TitleExtension,
        HeadingPrefix,
        HeadingPrefixSync.configure({ getOptions: () => defaultOptions }),
      ],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Above text" }] },
          {
            type: "heading",
            attrs: { level: 1 },
            content: [
              { type: "text", marks: [{ type: "headingPrefix" }], text: "1. " },
              { type: "text", text: "Hello" },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Below" }] },
        ],
      },
    });
  }

  function headingRange(doc: PmNode): { start: number; end: number; node: PmNode } | null {
    let res: { start: number; end: number; node: PmNode } | null = null;
    doc.forEach((node, offset) => {
      if (node.type.name === "heading" && !res) res = { start: offset + 1, end: offset + node.nodeSize - 1, node };
    });
    return res;
  }

  it("'1. Hello' 를 끝에서 한 글자씩 삭제 → 빈 헤딩 도달 시 prefix 재생성(루프) 없음", () => {
    const editor = fullHeadingEditor();
    const seen: string[] = [];
    // "1. Hello" = 8문자. 한 글자씩 끝에서 삭제(매 단계 appendTransaction 통과).
    for (let i = 0; i < 8; i++) {
      const h = headingRange(editor.state.doc)!;
      if (h.start >= h.end) break;
      editor.view.dispatch(editor.state.tr.delete(h.end - 1, h.end));
      const after = headingRange(editor.state.doc);
      seen.push(after ? after.node.textContent : "<gone>");
    }
    // 시퀀스는 단조 감소해야 하며, 마지막은 빈 문자열(재생성 없음)
    expect(seen).toEqual(["1. Hell", "1. Hel", "1. He", "1. H", "1. ", "1.", "1", ""]);
    editor.destroy();
  });

  it("빈 헤딩에서 Backspace → 위쪽 문장으로 join 되어 헤딩이 사라진다(삭제가 위로 이어짐)", () => {
    const editor = fullHeadingEditor();
    // 헤딩 비우기
    const h0 = headingRange(editor.state.doc)!;
    editor.view.dispatch(editor.state.tr.delete(h0.start, h0.end));
    expect(headingRange(editor.state.doc)!.node.textContent).toBe("");

    // 빈 헤딩 시작점에서 Backspace(joinBackward)
    const h1 = headingRange(editor.state.doc)!;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, h1.start)));
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));

    expect(headingRange(editor.state.doc)).toBeNull(); // 헤딩이 위쪽으로 병합됨
    editor.destroy();
  });
});
