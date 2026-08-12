import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { A4_WIDTH } from "./createPreviewExtensions";

/**
 * 미리보기 스케일/줌 + 모바일 핀치줌. editor 는 마운트 신호(ResizeObserver 트리거)로만 쓰고
 * editor state 를 읽지 않는다 — 에디터 로직(usePreviewEditor)과 완전히 분리.
 *
 *  - scale: 컨테이너 폭에 맞춰 A4(794px)를 축소(데스크탑/모바일 공통).
 *  - userZoom: 모바일 두 손가락 핀치로 문서 본문만 확대(도구모음·헤더는 컨테이너 밖이라 고정).
 *  - unscaledH: scale transform 은 레이아웃 높이를 바꾸지 않으므로, 스크롤 영역을 시각 높이에
 *    맞추기 위해 unscaled 높이를 실측(ResizeObserver) → JSX 에서 effectiveScale 곱.
 */
export function usePreviewScale(editor: Editor | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scaledInnerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const userZoomRef = useRef(1);
  userZoomRef.current = userZoom;
  const [unscaledH, setUnscaledH] = useState(0);
  const effectiveScale = scale * userZoom;

  const calcScale = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48;
      setScale(Math.min(containerWidth / A4_WIDTH, 1));
    }
  }, []);

  useEffect(() => {
    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [calcScale]);

  // transform: scale(effectiveScale) 은 시각만 바꾸고 레이아웃 높이는 안 바꾼다.
  // unscaled 높이를 재서 스크롤 영역을 시각(축소) 높이에 맞춘다 → 핀치확대 시 네이티브 pan/scroll 가능.
  useEffect(() => {
    const el = scaledInnerRef.current;
    if (!el) return;
    const measure = () => setUnscaledH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor]);

  // 모바일: 두 손가락 핀치로 문서 본문만 확대(도구 모음·헤더는 컨테이너 밖이라 고정).
  // 한 손가락은 편집/스크롤에 그대로 사용 → 터치가 2점일 때만 가로챈다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 4;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const distance = (a: Touch, b: Touch) =>
      Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    let pinching = false;
    let startDist = 0;
    let startZoom = 1;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        startDist = distance(e.touches[0], e.touches[1]);
        startZoom = userZoomRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // 브라우저 기본 핀치줌/스크롤 억제
      if (startDist > 0) {
        const ratio = distance(e.touches[0], e.touches[1]) / startDist;
        setUserZoom(clamp(startZoom * ratio, MIN_ZOOM, MAX_ZOOM));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinching = false;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { containerRef, scaledInnerRef, effectiveScale, userZoom, setUserZoom, unscaledH };
}
