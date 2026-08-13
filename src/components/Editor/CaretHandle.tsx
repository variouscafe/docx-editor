import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { caretPosFromPoint } from "@/utils/caretPos";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * 모바일 커서(캐럿) 드래그 핀.
 *
 * 배경 — 모바일에선 손가락이 커서를 가려 정밀 배치가 어렵다. 커서 근처에 드래그 가능한 핀을
 * 띄워 손가락으로 드래그하면 커서가 따라온다. 드래그 중 caretPosFromPoint 로 손가락 위
 * DRAG_OFFSET px 지점의 정확한 텍스트 pos 를 구해 커서를 옮긴다(scale 환경에서도 시각
 * 히트테스트라 정확). 핀 시각은 손가락 위치에, 위로 뻗은 줄기 끝(=커서 표시점)이 손가락 위
 * 30px 에 와 손가락이 커서를 가리지 않는다(iOS 식).
 *
 * 좌표 공간 — coordsAtPos(핀 위치) · caretPosFromPoint(드래그 매핑) · touch clientX/Y 모두
 * 뷰포트 좌표(transform 시각 반영). 핀은 transform 조상(scaledInnerRef) 밖(document.body
 * portal + position:fixed)에 렌더 → fixed 가 뷰포트 기준으로 동작(안 그러면 transform 이
 * containing block 이 돼 어긋남).
 *
 * 표시 조건 — 모바일 + 에디터 포커스 + collapsed 텍스트 selection(CellSelection 제외).
 * 표 셀 범위 선택/텍스트 드래그 선택 중엔 숨김.
 */
const DRAG_OFFSET = 30; // 매핑 지점을 손가락 위로 올려 커서가 손가락에 안 가리게
const STEM_HEIGHT = 16;

export function CaretHandle({ editor }: { editor: Editor }) {
  const isMobile = useIsMobile();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [focused, setFocused] = useState(() => editor.isFocused);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const lastKey = useRef("");
  const pinRef = useRef<HTMLDivElement>(null);

  // selection/트랜잭션 변경 시 리렌더 → 핀 위치 재계산.
  useEffect(() => {
    const u = () => bump();
    editor.on("transaction", u);
    return () => {
      editor.off("transaction", u);
    };
  }, [editor]);

  // 포커스 추적 — 포커스 잃으면 핀 숨김.
  useEffect(() => {
    const onF = () => setFocused(true);
    const onB = () => setFocused(false);
    editor.on("focus", onF);
    editor.on("blur", onB);
    return () => {
      editor.off("focus", onF);
      editor.off("blur", onB);
    };
  }, [editor]);

  // 핀 위치 계산(비드래그). 드래그 중엔 touchmove 핸들러가 pin 을 덮어쓴다.
  // 라운드한 좌표 키로 중복 setPin 방지 → 무한 루프 차단.
  useLayoutEffect(() => {
    if (dragging.current) return;
    const { selection } = editor.state;
    const visible =
      isMobile &&
      focused &&
      selection.empty &&
      !(selection instanceof CellSelection);
    if (!visible) {
      if (lastKey.current !== "") {
        lastKey.current = "";
        setPin(null);
      }
      return;
    }
    try {
      const c = editor.view.coordsAtPos(selection.head);
      const y = c.top;
      if (y < -40 || y > window.innerHeight + 40) {
        if (lastKey.current !== "") {
          lastKey.current = "";
          setPin(null);
        }
        return;
      }
      const key = `${Math.round((c.left + c.right) / 2)},${Math.round(y)}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        setPin({ x: (c.left + c.right) / 2, y });
      }
    } catch {
      if (lastKey.current !== "") {
        lastKey.current = "";
        setPin(null);
      }
    }
  });

  // 드래그: native 비 passive touchstart 로 preventDefault 보장(React onTouchStart 은 passive).
  useEffect(() => {
    const el = pinRef.current;
    if (!el) return;

    const move = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0];
      // 손가락 위 DRAG_OFFSET 지점의 정확한 텍스트 pos → 커서 이동.
      const pos = caretPosFromPoint(editor.view, t.clientX, t.clientY - DRAG_OFFSET);
      if (pos != null) {
        try {
          const sel = TextSelection.near(editor.state.doc.resolve(pos), 1);
          editor.view.dispatch(editor.state.tr.setSelection(sel));
        } catch {
          /* ignore — 다음 move 에 재시도 */
        }
      }
      // 핀 시각은 손가락 위치(줄기 끝 = 손가락 위 30px = 매핑 지점).
      setPin({ x: t.clientX, y: t.clientY - DRAG_OFFSET });
    };

    const end = () => {
      dragging.current = false;
      lastKey.current = ""; // 스냅 강제 재계산
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      bump();
    };

    const start = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      dragging.current = true;
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", end);
      window.addEventListener("touchcancel", end);
    };

    el.addEventListener("touchstart", start, { passive: false });
    return () => {
      el.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [editor, isMobile]);

  if (!isMobile) return null;

  return createPortal(
    <div
      ref={pinRef}
      style={
        pin
          ? {
              position: "fixed",
              left: pin.x,
              top: pin.y,
              transform: "translate(-50%, 0)",
              zIndex: 50,
              touchAction: "none",
              pointerEvents: "auto",
            }
          : { display: "none" }
      }
    >
      {/* 커서 표시선(위쪽 끝 = 커서 지점) */}
      <div
        style={{
          width: 2,
          height: STEM_HEIGHT,
          margin: "0 auto",
          background: "var(--preview-accent, #2563eb)",
        }}
      />
      {/* 그랩 핸들 */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "9999px",
          margin: "-3px auto 0",
          background: "var(--preview-accent, #2563eb)",
          border: "2px solid #ffffff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "9999px", background: "#ffffff" }} />
      </div>
    </div>,
    document.body,
  );
}
