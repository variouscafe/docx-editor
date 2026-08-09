import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { shouldBlockCellDelete } from "./tableDeleteGuard";

/**
 * 표 셀 삭제 가드의 순수 결정 함수를 직접 검증.
 * (TipTap 에디터/뷰 없이 prosemirror-model Schema + EditorState 로 상태를 구성 — node 환경)
 *
 * 목표: 모바일/데스크톱에서 "delete 길게 누름 → 행 삭제" 버그를 막는 경계 판정이
 *  - 셀 내부 일반 삭제는 허용하고
 *  - 셀 밖으로 이탈하는 삭제만 차단하는지
 * 확인한다.
 */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    table: { group: "block", content: "tableRow+" },
    tableRow: { content: "(tableCell | tableHeader)*" },
    tableCell: { content: "block+", isolating: true },
    tableHeader: { content: "block+", isolating: true },
  },
  marks: {},
});

// doc 구조:
//   table
//     row0: [ cell("ab") , cell("") ]   ← 두 번째 셀은 빈 셀
//     row1: [ cell("cd") , cell("ef") ]
//   paragraph "outside"
const DOC_JSON = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "ab" }] }],
            },
            { type: "tableCell", content: [{ type: "paragraph" }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "cd" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "ef" }] }],
            },
          ],
        },
      ],
    },
    { type: "paragraph", content: [{ type: "text", text: "outside" }] },
  ],
};

interface Positions {
  ab: number; // 텍스트 "ab" 시작(=셀 콘텐츠 맨 앞)
  cd: number;
  ef: number;
  emptyCellPara: number; // 빈 셀의 빈 문단 노드 시작
  outside: number; // 표 바깥 문단
}

function findPositions(doc: import("@tiptap/pm/model").Node): Positions {
  const p: Partial<Positions> = {};
  doc.descendants((node, pos) => {
    if (node.isText) {
      if (node.text === "ab") p.ab = pos;
      if (node.text === "cd") p.cd = pos;
      if (node.text === "ef") p.ef = pos;
      if (node.text === "outside") p.outside = pos;
    }
    if (node.type.name === "paragraph" && node.content.size === 0 && p.emptyCellPara === undefined) {
      // 빈 문단이 표 셀 안에 있는지
      const $pos = doc.resolve(pos);
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === "tableCell") {
          p.emptyCellPara = pos;
          break;
        }
      }
    }
    return true;
  });
  return p as Positions;
}

function stateAt(doc: import("@tiptap/pm/model").Node, pos: number, end?: number): EditorState {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos, end ?? pos),
  });
}

describe("shouldBlockCellDelete", () => {
  const doc = schema.nodeFromJSON(DOC_JSON);
  const pos = findPositions(doc);

  it("셀 첫 블록 맨 앞에서 Backspace는 차단(셀 밖 이탈 방지)", () => {
    // "ab" 앞 = 첫 번째 셀 콘텐츠 맨 앞
    expect(shouldBlockCellDelete(stateAt(doc, pos.ab), "backward")).toBe(true);
    // "cd" 앞 = 두 번째 행 첫 셀 맨 앞
    expect(shouldBlockCellDelete(stateAt(doc, pos.cd), "backward")).toBe(true);
  });

  it("셀 내부 문자 중간/끝에서 Backspace는 허용(일반 삭제)", () => {
    expect(shouldBlockCellDelete(stateAt(doc, pos.ab + 1), "backward")).toBe(false); // 'a' 삭제
    expect(shouldBlockCellDelete(stateAt(doc, pos.ab + 2), "backward")).toBe(false); // 'b' 삭제(끝)
  });

  it("셀 마지막 블록 맨 끝에서 Delete(전진)는 차단(셀 밖 이탈 방지)", () => {
    // "ef" 끝 = 마지막 셀 콘텐츠 맨 끝
    expect(shouldBlockCellDelete(stateAt(doc, pos.ef + 2), "forward")).toBe(true);
    // "ab" 끝 = 첫 행 첫 셀(유일 블록) 맨 끝 → 전진 시 셀 밖
    expect(shouldBlockCellDelete(stateAt(doc, pos.ab + 2), "forward")).toBe(true);
  });

  it("셀 내부 문자 중간/앞에서 Delete(전진)는 허용(일반 삭제)", () => {
    expect(shouldBlockCellDelete(stateAt(doc, pos.ab), "forward")).toBe(false); // 'a' 전진삭제
    expect(shouldBlockCellDelete(stateAt(doc, pos.ef + 1), "forward")).toBe(false); // 'f' 전진삭제
  });

  it("빈 셀에서는 Backspace/Delete 모두 차단(행 삭제 방지)", () => {
    const cursor = pos.emptyCellPara + 1; // 빈 문단 콘텐츠 위치(시작=끝)
    expect(shouldBlockCellDelete(stateAt(doc, cursor), "backward")).toBe(true);
    expect(shouldBlockCellDelete(stateAt(doc, cursor), "forward")).toBe(true);
  });

  it("표 바깥에서는 간섭하지 않는다", () => {
    expect(shouldBlockCellDelete(stateAt(doc, pos.outside), "backward")).toBe(false);
    expect(shouldBlockCellDelete(stateAt(doc, pos.outside), "forward")).toBe(false);
  });

  it("범위 선택(드래그)은 표 확장 정상 동작에 맡긴다", () => {
    // "ab" 일부 범위 선택
    const st = stateAt(doc, pos.ab, pos.ab + 1);
    expect(shouldBlockCellDelete(st, "backward")).toBe(false);
    expect(shouldBlockCellDelete(st, "forward")).toBe(false);
  });
});
