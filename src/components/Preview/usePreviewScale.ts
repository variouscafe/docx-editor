import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { A4_WIDTH } from "./createPreviewExtensions";
import {
  computeAnchoredScroll,
  deriveTouchAction,
  nextZoom,
  touchDistance,
} from "./previewPan";

/**
 * 미리보기 스케일/줌 + 패닝. editor 는 마운트 신호(ResizeObserver 트리거)로만 쓰고
 * editor state 를 읽지 않는다 — 에디터 로직(usePreviewEditor)과 완전히 분리.
 *
 *  - scale: 컨테이너 폭에 맞춰 A4(794px)를 축소(데스크탑/모바일 공통).
 *  - userZoom: 모바일 두 손가락 핀치로 문서 본문만 확대(도구모음·헤더는 컨테이너 밖이라 고정).
 *  - unscaledH: scale transform 은 레이아웃 높이를 바꾸지 않으므로, 스크롤 영역을 시각 높이에
 *    맞추기 위해 unscaled 높이를 실측(ResizeObserver) → JSX 에서 effectiveScale 곱.
 *  - touchAction: **기하(가로 overflow)에서 파생해 내려준다**(deriveTouchAction). userZoom 조건이
 *    아니라 측정값으로 판정하므로, 향후 줌 소스가 추가돼도(데스크탑 ctrl+wheel 등) effectiveScale
 *    만 바꾸면 좌우 패닝이 기반 동작으로 자동 상속된다 — userZoom 체크로 "단순화"하지 말 것.
 *  - 핀치 앵커: 줌이 transformOrigin "top left" 기준이라 중앙을 핀치하면 보던 위치가 밀려나는
 *    것을, 시작 중심점 아래 콘텐츠가 현재 중심점을 따라가도록 스크롤 보정(computeAnchoredScroll).
 *    핀치 중 2손가락 드래그(중심점 이동)도 같은 수학으로 패닝된다.
 */
export function usePreviewScale(editor: Editor | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scaledInnerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [userZoom, setUserZoom] = useState(1);
  const userZoomRef = useRef(1);
  userZoomRef.current = userZoom;
  const [unscaledH, setUnscaledH] = useState(0);
  const effectiveScale = scale * userZoom;
  const effectiveScaleRef = useRef(1);
  effectiveScaleRef.current = effectiveScale;

  const calcScale = useCallback(() => {
    if (containerRef.current) {
      const clientWidth = containerRef.current.clientWidth;
      // -48 은 스케일 산출용 여유 폭. 패닝 판정에는 순수 clientWidth(실제 스크롤 포트 폭)를 쓴다.
      setScale(Math.min((clientWidth - 48) / A4_WIDTH, 1));
      setContainerWidth(clientWidth);
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

  // 가로 패닝 가능 여부는 기하에서 파생(마운트 직후 측정 전 containerWidth=0 이면 기존 동작 pan-y).
  const touchAction =
    containerWidth > 0 ? deriveTouchAction(A4_WIDTH * effectiveScale, containerWidth) : "pan-y";

  // 핀치 앵커 — 제스처 시작 시 중심점 아래 콘텐츠 좌표(unscaled)를 고정하고, 중심점은 손가락을
  // 따라 갱신. scroll 보정은 아래 useLayoutEffect 에서(여기서는 좌표만 유지).
  const pinchAnchorRef = useRef<{ ux: number; uy: number; midX: number; midY: number } | null>(
    null
  );

  // 앵커 스크롤 보정 — 래퍼 폭(width = A4 × effectiveScale)이 React 커밋으로 갱신된 직후,
  // 즉 레이아웃 단계에 적용해야 새 scrollWidth 로 clamp 된다. touchmove 안에서 직접 할당하면
  // stale scrollWidth 로 잘린다.
  useLayoutEffect(() => {
    const anchor = pinchAnchorRef.current;
    const cont = containerRef.current;
    const inner = scaledInnerRef.current;
    if (!anchor || !cont || !inner) return;
    const contRect = cont.getBoundingClientRect();
    const innerRect = inner.getBoundingClientRect();
    const { scrollLeft, scrollTop } = computeAnchoredScroll({
      anchorUX: anchor.ux,
      anchorUY: anchor.uy,
      midX: anchor.midX - contRect.left,
      midY: anchor.midY - contRect.top,
      innerLeft: innerRect.left - contRect.left,
      innerTop: innerRect.top - contRect.top,
      scrollLeft: cont.scrollLeft,
      scrollTop: cont.scrollTop,
      scale: effectiveScale,
      maxScrollLeft: cont.scrollWidth - cont.clientWidth,
      maxScrollTop: cont.scrollHeight - cont.clientHeight,
    });
    cont.scrollLeft = scrollLeft;
    cont.scrollTop = scrollTop;
  }, [effectiveScale]);

  // 모바일: 두 손가락 핀치로 문서 본문만 확대(도구 모음·헤더는 컨테이너 밖이라 고정).
  // 한 손가락은 편집/스크롤에 그대로 사용 → 터치가 2점일 때만 가로챈다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let pinching = false;
    let startDist = 0;
    let startZoom = 1;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        startDist = touchDistance(e.touches[0], e.touches[1]);
        startZoom = userZoomRef.current;
        // 앵커 고정: 시작 중심점 아래 콘텐츠 좌표. scaledInner 은 transformOrigin "top left" 로
        // 스케일되므로 (mid − rect)/s 가 곧 unscaled 콘텐츠 좌표다.
        const inner = scaledInnerRef.current;
        const s = effectiveScaleRef.current;
        if (inner && s > 0) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = inner.getBoundingClientRect();
          pinchAnchorRef.current = {
            ux: (midX - rect.left) / s,
            uy: (midY - rect.top) / s,
            midX,
            midY,
          };
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // 브라우저 기본 핀치줌/스크롤 억제
      const anchor = pinchAnchorRef.current;
      if (anchor) {
        // 중심점 갱신 — 핀치 유지 중 2손가락 드래그 → 앵커 보정이 패닝으로 이어진다.
        anchor.midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        anchor.midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
      if (startDist > 0) {
        setUserZoom(nextZoom(startZoom, touchDistance(e.touches[0], e.touches[1]) / startDist));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinching = false;
        pinchAnchorRef.current = null; // 제스처 종료 → 이후 스크롤은 네이티브에 맡김
      }
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

  return {
    containerRef,
    scaledInnerRef,
    effectiveScale,
    userZoom,
    setUserZoom,
    unscaledH,
    touchAction,
  };
}
