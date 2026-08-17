// @vitest-environment jsdom
/**
 * 모바일(터치) handleClick 보정 — 이미지 NodeView 터치 시 노드 선택 검증.
 * coarse pointer 환경에서 텍스트 캐럿 배치 핸들러가 이미지 선택을 가로채
 * 리사이즈 핸들·크기 프리셋이 죽던 결함(2026-08-17 점검 P2)의 회귀 방지.
 * jsdom 은 posAtCoords 가 작동하지 않아 PM 라우팅이 왜곡되므로 핸들러를 직접 호출한다.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, type Selection } from "@tiptap/pm/state";
import { createPreviewExtensions } from "./createPreviewExtensions";
import { defaultOptions } from "@shared/options";
import { EditorImage } from "../Editor/extensions/image";

// jsdom 은 ResizeObserver 미구현 — MeasurePagination 'create' 핸들러용 스텁.
class ResizeObserverStub {
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

const DOC = {
  type: "doc",
  content: [
    {
      type: "image",
      attrs: {
        src: "/api/images/00000000-0000-4000-8000-000000000000",
        alt: "",
        caption: "",
        width: 100,
        height: 50,
      },
    },
    { type: "paragraph", content: [{ type: "text", text: "본문" }] },
  ],
};

const origMatchMedia = window.matchMedia?.bind(window);

beforeAll(() => {
  // 터치 기기(coarse pointer) 시뮬레이션
  (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = ((q: string) =>
    ({ matches: true, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof matchMedia;
});

afterAll(() => {
  if (origMatchMedia) (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = origMatchMedia;
});

function setup() {
  const { extensions, editorProps } = createPreviewExtensions({
    getOptions: () => defaultOptions,
    pageHeight: 1123,
    pageWidth: 794,
  });
  const editor = new Editor({ extensions: [...extensions, EditorImage], editorProps, content: DOC });
  const handleClick = editorProps.handleClick as (view: Editor["view"], pos: number, event: MouseEvent) => boolean;
  return { editor, handleClick };
}

const clickOn = (el: Element) =>
  ({ target: el, clientX: 0, clientY: 0, button: 0, preventDefault: () => {} }) as unknown as MouseEvent;

describe("터치 handleClick — 이미지 NodeView", () => {
  it("이미지 영역 터치 → NodeSelection(핸들·프리셋 활성화)", () => {
    const { editor, handleClick } = setup();
    const figure = editor.view.dom.querySelector("figure.rm-image-figure") as HTMLElement;
    const img = figure.querySelector("img")!;
    expect(handleClick(editor.view, 0, clickOn(img))).toBe(true);

    const sel = editor.state.selection;
    expect(sel instanceof NodeSelection).toBe(true);
    expect((sel as NodeSelection).node.type.name).toBe("image");
    expect(figure.classList.contains("ProseMirror-selectednode")).toBe(true);
    editor.destroy();
  });

  it("캡션(figcaption) 터치는 노드 선택하지 않는다(캡션 자체 편집 보존)", () => {
    const { editor, handleClick } = setup();
    const caption = editor.view.dom.querySelector("figcaption.rm-image-caption")!;
    const before: Selection = editor.state.selection;
    expect(handleClick(editor.view, 0, clickOn(caption))).toBe(true);
    expect(editor.state.selection).toBe(before); // 선택 변경 없음(캡션 캐럿 보존)
    editor.destroy();
  });

  it("데스크톱(coarse 아님)·편집 불가에선 간섭하지 않는다", () => {
    (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = ((q: string) =>
      ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof matchMedia;
    try {
      const { editor, handleClick } = setup();
      const img = editor.view.dom.querySelector("figure.rm-image-figure img")!;
      expect(handleClick(editor.view, 0, clickOn(img))).toBe(false);
      editor.destroy();
    } finally {
      (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = ((q: string) =>
        ({ matches: true, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof matchMedia;
    }
  });
});
