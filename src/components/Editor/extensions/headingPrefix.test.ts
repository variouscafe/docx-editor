import { describe, it, expect } from "vitest";
import { Schema, Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { syncHeadingPrefixes } from "./headingPrefix";
import { defaultOptions } from "@shared/options";

/**
 * HeadingPrefixSync 의 순수 로직(syncHeadingPrefixes)을 직접 검증.
 * 핵심 회귀: 헤딩을 Backspace로 비울 때 prefix가 재삽입되는 "삭제 루프" 방지.
 */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    text: { group: "inline" },
  },
  marks: {
    headingPrefix: {},
  },
});

describe("syncHeadingPrefixes — 삭제 루프 방지", () => {
  it("이미 헤딩이던 것을 지워 비운 경우 prefix를 재삽입하지 않는다(루프 방지)", () => {
    const oldState = EditorState.create({
      doc: Node.fromJSON(schema, {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "1. Hello" }],
          },
        ],
      }),
    });
    // 헤딩 텍스트 전체 삭제 → 빈 헤딩
    const tr = oldState.tr.delete(1, 1 + "1. Hello".length);
    const newState = oldState.apply(tr);
    expect(newState.doc.firstChild!.content.size).toBe(0); // 비워짐 확인

    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).toBeNull(); // 재삽입 없음
  });

  it("새로 헤딩이 된(생성된) 빈 헤딩에는 prefix를 삽입한다", () => {
    const oldState = EditorState.create({
      doc: Node.fromJSON(schema, {
        type: "doc",
        content: [{ type: "paragraph" }], // 빈 문단
      }),
    });
    // 문단 → 빈 헤딩(input rule "### " 변환 등과 동등)
    const tr = oldState.tr.setNodeMarkup(0, schema.nodes.heading, { level: 1 });
    const newState = oldState.apply(tr);
    expect(newState.doc.firstChild!.type.name).toBe("heading");
    expect(newState.doc.firstChild!.content.size).toBe(0);

    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).not.toBeNull();
    const final = newState.apply(result!);
    const h = final.doc.firstChild!;
    expect(h.type.name).toBe("heading");
    expect(h.textContent).toBe("1. "); // NUMBER_DOT count 1 prefix
    // 삽입된 텍스트에 headingPrefix mark 부여
    expect(h.firstChild!.marks.some((m) => m.type.name === "headingPrefix")).toBe(true);
  });

  it("docChanged가 없으면 아무것도 하지 않는다", () => {
    const oldState = EditorState.create({
      doc: Node.fromJSON(schema, { type: "doc", content: [{ type: "paragraph" }] }),
    });
    const tr = oldState.tr; // 변경 없음
    const result = syncHeadingPrefixes([tr], oldState, oldState, defaultOptions);
    expect(result).toBeNull();
  });
});
