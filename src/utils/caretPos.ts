import type { EditorView } from "@tiptap/pm/view";

/**
 * 터치/클릭한 뷰포트 좌표(x, y)를 정확한 ProseMirror 문서 위치(pos)로 변환.
 *
 * 왜 필요한가 — 에디터가 transform:scale 안에 렌더링되어 ProseMirror 자체 좌표 연산(posAtCoords)이
 * 왜곡된다. 하지만 document.caretPositionFromPoint / caretRangeFromPoint 는 elementFromPoint 처럼
 * 시각 트리(transform 반영)를 히트테스트하므로 scale 환경에서도 터치한 글자의 정확한
 * (노드, offset)을 반환한다. 이를 view.posAtDOM 으로 매핑하면 글자 단위 정확도.
 *
 * 실패(브라우저 미구현, 에디터 DOM 바깥, posAtDOM 예외) 시 null → 호출처가 블록 단위 fallback 처리.
 *
 * 소비처: createPreviewExtensions.handleClick(터치 배치), CaretHandle(드래그 핀).
 */
export function caretPosFromPoint(view: EditorView, x: number, y: number): number | null {
  const doc = view.dom.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let node: Node | null = null;
  let offset = 0;

  // 표준(Chromium 최신/Firefox) 우선 → WebKit fallback.
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    if (!p) return null;
    node = p.offsetNode;
    offset = p.offset;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer;
    offset = r.startOffset;
  } else {
    return null;
  }

  if (!node || !view.dom.contains(node)) return null;
  try {
    return view.posAtDOM(node, offset);
  } catch {
    return null;
  }
}
