import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection, cellAround } from "@tiptap/pm/tables";

/**
 * 모바일 터치로 표 셀을 드래그해 범위(CellSelection)를 선택한다.
 *
 * 배경: TipTap/ProseMirror 의 표 셀 드래그 선택은 데스크탑 마우스(mousedown→mousemove)로
 * 동작한다. 모바일 터치는 mouse 이벤트로 충분히 에뮬레이션되지 않고, 문서 컨테이너의
 * touch-action(스크롤)이 터치 이동을 선점해 셀 드래그가 아예 일어나지 않는다.
 *
 * 전략: 표 셀에서 시작한 1손가락 드래그만 가로채 직접 CellSelection 을 만든다.
 *  - touchstart: 시작 셀(anchor) 후보만 기록. 일반 탭(커서 이동)은 그대로 허용.
 *  - touchmove: 이동량이 임계치(8px)를 넘으면 셀 선택 모드 진입 → 스크롤을 막고(preventDefault)
 *    손가락 아래 셀까지 CellSelection.create(anchor, head) 로 확장.
 *  - touchend: 그대로 둔다(선택 유지).
 * 2손가락(핀치줌)·셀 바깥 터치는 무시 → 스크롤/편집에 영향 없음.
 *
 * 터치 좌표 → 셀 pos: elementFromPoint 로 td/th 를 찾고 posAtDOM 으로 pos(=셀 content 시작)를
 * 얻는다. 표가 display:contents/flex 로 렌더링돼 posAtCoords 가 왜곡되는 문제를 우회한다.
 * 선택된 범위에는 가운데 정렬·통화(원) 포맷·셀 병합 등이 일괄 적용된다.
 */
export const tableCellDragKey = new PluginKey("tableCellDragSelect");

const DRAG_THRESHOLD = 8; // px — 이 이상 이동해야 드래그(셀 선택)로 간주

/** 터치 좌표가 표 셀 위면 그 셀의 content pos, 아니면 null. */
function cellPosAt(view: EditorView, x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y) as Element | null;
  if (!el) return null;
  const td = el.closest("td, th");
  if (!td || !view.dom.contains(td)) return null;
  try {
    return view.posAtDOM(td, 0);
  } catch {
    return null;
  }
}

interface DragState {
  startX: number;
  startY: number;
  anchor: number; // 시작 셀(content) pos
  active: boolean; // 임계치 통과 → 셀 선택 모드
}

export const TableCellDragSelect = Extension.create({
  name: "tableCellDragSelect",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableCellDragKey,
        view(view: EditorView) {
          let drag: DragState | null = null;

          const cellAt = (x: number, y: number): number | null => {
            const pos = cellPosAt(view, x, y);
            if (pos == null) return null;
            const $cell = cellAround(view.state.doc.resolve(pos));
            return $cell ? $cell.pos : null;
          };

          const onStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) {
              drag = null;
              return;
            }
            const t = e.touches[0];
            const pos = cellAt(t.clientX, t.clientY);
            drag = pos == null ? null : { startX: t.clientX, startY: t.clientY, anchor: pos, active: false };
          };

          const onMove = (e: TouchEvent) => {
            if (!drag || e.touches.length !== 1) return;
            const t = e.touches[0];
            if (!drag.active && Math.hypot(t.clientX - drag.startX, t.clientY - drag.startY) < DRAG_THRESHOLD) {
              return; // 아직 일반 탭 범위 — 커서/스크롤 그대로
            }
            e.preventDefault(); // 셀 선택 모드 → 스크롤 억제
            const head = cellAt(t.clientX, t.clientY);
            if (head == null) return;
            drag.active = true;
            const { state } = view;
            try {
              view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, drag.anchor, head)));
            } catch {
              /* anchor/head 가 직사각형 범위를 만들 수 없으면 무시 */
            }
          };

          const onEnd = () => {
            drag = null; // 활성화됐던 선택은 CellSelection 으로 유지
          };

          // touchmove 의 preventDefault(스크롤 억제)를 위해 non-passive 로 등록.
          view.dom.addEventListener("touchstart", onStart, { passive: false });
          view.dom.addEventListener("touchmove", onMove, { passive: false });
          view.dom.addEventListener("touchend", onEnd);
          view.dom.addEventListener("touchcancel", onEnd);
          return {
            destroy() {
              view.dom.removeEventListener("touchstart", onStart);
              view.dom.removeEventListener("touchmove", onMove);
              view.dom.removeEventListener("touchend", onEnd);
              view.dom.removeEventListener("touchcancel", onEnd);
            },
          };
        },
      }),
    ];
  },
});
