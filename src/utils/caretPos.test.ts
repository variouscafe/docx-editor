// @vitest-environment jsdom
/**
 * caretPosFromPoint 단위 검증 — 브라우저 API(caretPositionFromPoint/caretRangeFromPoint)는
 * jsdom 이 lib.dom.d.ts 에 required 로 선언하므로, document 를 unknown 경유 optional 핸들로
 * 잡아 stub(set/delete) 한다. view 는 최소 stub(dom + posAtDOM).
 */
import { describe, it, expect, afterEach } from "vitest";
import { caretPosFromPoint } from "./caretPos";
import type { EditorView } from "@tiptap/pm/view";

/** document 의 caret* API 를 stub 가능한 optional 핸들(lib 의 required 시그니처 회피). */
const api = document as unknown as {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function makeView(posAtDOM: (node: Node, offset: number) => number): EditorView {
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  return { dom, posAtDOM } as unknown as EditorView;
}

afterEach(() => {
  delete api.caretPositionFromPoint;
  delete api.caretRangeFromPoint;
  document.body.innerHTML = "";
});

describe("caretPosFromPoint", () => {
  it("두 API 모두 없으면 null", () => {
    delete api.caretPositionFromPoint;
    delete api.caretRangeFromPoint;
    const view = makeView(() => 5);
    expect(caretPosFromPoint(view, 10, 20)).toBeNull();
  });

  it("caretPositionFromPoint 경로 → posAtDOM 결과 반환", () => {
    delete api.caretRangeFromPoint; // 표준 API 경로만 활성화
    const view = makeView(() => 42);
    const target = document.createTextNode("hi");
    view.dom.appendChild(target); // view.dom 안에 배치 → contains 통과
    api.caretPositionFromPoint = () => ({ offsetNode: target, offset: 1 });
    expect(caretPosFromPoint(view, 10, 20)).toBe(42);
  });

  it("caretRangeFromPoint(WebKit) 경로 → posAtDOM 결과 반환", () => {
    delete api.caretPositionFromPoint; // WebKit fallback 경로만 활성화
    const view = makeView(() => 7);
    const target = document.createTextNode("hi");
    view.dom.appendChild(target);
    const range = { startContainer: target, startOffset: 2 } as unknown as Range;
    api.caretRangeFromPoint = () => range;
    expect(caretPosFromPoint(view, 5, 5)).toBe(7);
  });

  it("에디터 DOM 바깥 노드면 null", () => {
    const view = makeView(() => 99);
    const outside = document.createTextNode("x");
    document.body.appendChild(outside); // view.dom 밖(body 직계 자식)
    api.caretPositionFromPoint = () => ({ offsetNode: outside, offset: 0 });
    expect(caretPosFromPoint(view, 0, 0)).toBeNull();
  });

  it("posAtDOM 이 예외 던지면 null(fallback 유도)", () => {
    const view = makeView(() => {
      throw new Error("boom");
    });
    const target = document.createTextNode("hi");
    view.dom.appendChild(target);
    api.caretPositionFromPoint = () => ({ offsetNode: target, offset: 0 });
    expect(caretPosFromPoint(view, 1, 1)).toBeNull();
  });
});
