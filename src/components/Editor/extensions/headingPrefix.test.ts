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

describe("syncHeadingPrefixes — 재번호화/변환", () => {
  const doc3 = Node.fromJSON(schema, {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [
          { type: "text", text: "1. ", marks: [{ type: "headingPrefix" }] },
          { type: "text", text: "First" },
        ],
      },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [
          { type: "text", text: "2. ", marks: [{ type: "headingPrefix" }] },
          { type: "text", text: "Third" },
        ],
      },
    ],
  });

  it("중간에 헤딩을 삽입하면 이후 헤딩이 재번호화된다(번호 중복 방지)", () => {
    const oldState = EditorState.create({
      doc: Node.fromJSON(schema, {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [
              { type: "text", text: "1. ", marks: [{ type: "headingPrefix" }] },
              { type: "text", text: "First" },
            ],
          },
          {
            type: "heading",
            attrs: { level: 1 },
            content: [
              { type: "text", text: "2. ", marks: [{ type: "headingPrefix" }] },
              { type: "text", text: "Third" },
            ],
          },
        ],
      }),
    });
    // 첫 헤딩 뒤에 새 빈 헤딩 삽입(Enter 분할과 동등)
    const firstSize = oldState.doc.firstChild!.nodeSize;
    const tr = oldState.tr.split(firstSize - 1); // 첫 헤딩 끝에서 분할 → 빈 헤딩 생성
    const newState = oldState.apply(tr);
    const headings = newState.doc.content.content.filter((n) => n.type.name === "heading");
    expect(headings.length).toBe(3);

    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).not.toBeNull();
    const final = newState.apply(result!);
    const texts = final.doc.content.content
      .filter((n) => n.type.name === "heading")
      .map((n) => n.textContent);
    expect(texts).toEqual(["1. First", "2. ", "3. Third"]);
  });

  it("첫 헤딩을 삭제하면 이후 헤딩이 재번호화된다(번호 건너뜸 방지)", () => {
    const oldState = EditorState.create({ doc: doc3 });
    const tr = oldState.tr.delete(0, oldState.doc.firstChild!.nodeSize);
    const newState = oldState.apply(tr);
    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).not.toBeNull();
    const final = newState.apply(result!);
    expect(final.doc.firstChild!.textContent).toBe("1. Third");
  });

  it("내용 있는 문단을 헤딩으로 변환하면 prefix가 부여된다", () => {
    const oldState = EditorState.create({
      doc: Node.fromJSON(schema, {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        ],
      }),
    });
    const tr = oldState.tr.setNodeMarkup(0, schema.nodes.heading, { level: 1 });
    const newState = oldState.apply(tr);
    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).not.toBeNull();
    const final = newState.apply(result!);
    expect(final.doc.firstChild!.textContent).toBe("1. Hello");
  });

  it("헤딩 본문만 편집(구조 불변) 시 기존 prefix를 유지한다", () => {
    const oldState = EditorState.create({ doc: doc3 });
    // 첫 헤딩 본문 끝에 타이핑과 동등: "First" 뒤 "!" 삽입
    const tr = oldState.tr.insert("1. First".length + 1, schema.text("!"));
    const newState = oldState.apply(tr);
    const result = syncHeadingPrefixes([tr], oldState, newState, defaultOptions);
    expect(result).toBeNull();
    expect(newState.doc.firstChild!.textContent).toBe("1. First!");
  });
});
