// @vitest-environment jsdom
/**
 * 이미지 캡션 NodeView 통합 검증(실제 TipTap Editor + jsdom).
 *  - figure/figcaption 렌더 및 attrs → DOM 동기화
 *  - 캡션 타이핑(input 이벤트) → setNodeMarkup → getJSON 에 caption 반영
 *  - 읽기 전용(editable=false) + 빈 캡션 → 캡션 영역 숨김
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorImage } from "./image";

const DOC = {
  type: "doc",
  content: [
    {
      type: "image",
      attrs: { src: "/api/images/00000000-0000-4000-8000-000000000000", alt: "", caption: "설명", width: 100, height: 50 },
    },
    { type: "paragraph" },
  ],
};

function makeEditor(editable = true) {
  const editor = new Editor({
    extensions: [StarterKit.configure({ bulletList: false, orderedList: false, listItem: false }), EditorImage],
    content: DOC,
    editable,
  });
  return editor;
}

describe("이미지 캡션 NodeView", () => {
  it("figure + img + figcaption 구조로 렌더되고 캡션 텍스트가 attrs 에서 동기화", () => {
    const editor = makeEditor();
    const figure = editor.view.dom.querySelector("figure.rm-image-figure");
    expect(figure).not.toBeNull();
    const img = figure!.querySelector("img");
    expect(img).not.toBeNull();
    // 표시용 절대 URL 변환(API_URL 기본값 localhost:8787).
    expect(img!.getAttribute("src")).toContain("/api/images/00000000-0000-4000-8000-000000000000");
    const caption = figure!.querySelector("figcaption.rm-image-caption");
    expect(caption!.textContent).toBe("설명");
    expect(caption!.getAttribute("contenteditable")).toBe("true");
    // 크기 조절 핸들 — 이미지 박스(frame) 코너 4개.
    const frame = figure!.querySelector(".rm-image-frame");
    expect(frame).not.toBeNull();
    expect(frame!.contains(img!)).toBe(true);
    expect(frame!.querySelectorAll(".rm-image-handle").length).toBe(4);
    editor.destroy();
  });

  it("캡션 input → setNodeMarkup dispatch → getJSON caption 갱신", () => {
    const editor = makeEditor();
    const caption = editor.view.dom.querySelector("figcaption.rm-image-caption")!;
    caption.textContent = "수정된 설명";
    caption.dispatchEvent(new Event("input", { bubbles: true }));
    const imageNode = editor.getJSON().content?.[0];
    expect(imageNode?.attrs?.caption).toBe("수정된 설명");
    // 다른 attrs(src/치수)는 보존.
    expect(imageNode?.attrs?.src).toBe("/api/images/00000000-0000-4000-8000-000000000000");
    expect(imageNode?.attrs?.width).toBe(100);
    editor.destroy();
  });

  it("빈 캡션 + 편집 가능 → placeholder 클래스, 읽기 전용 → 숨김", () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ bulletList: false, orderedList: false, listItem: false }), EditorImage],
      content: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "/api/images/x", caption: "" } }, { type: "paragraph" }],
      },
      editable: false,
    });
    const caption = editor.view.dom.querySelector("figcaption.rm-image-caption")!;
    expect(caption.classList.contains("rm-image-caption-empty")).toBe(true);
    expect(caption.getAttribute("contenteditable")).toBe("false"); // 공유 보기 = 편집 불가
    editor.destroy();
  });
});
