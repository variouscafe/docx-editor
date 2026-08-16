/**
 * 미리보기 뷰포트(줌·패닝)의 순수 계산 — React/DOM 의존 0. usePreviewScale 이 소비한다.
 *
 * 핵심 설계(기반 동작 분리): 가로 패닝 가능 여부는 특정 줌 제스처(userZoom !== 1 등)가
 * 아니라 **측정된 기하**(확대된 페이지 폭 > 스크롤 포트 폭)에서 파생한다. 이래야 향후
 * 어떤 줌 소스가 추가돼도(데스크톱 ctrl+wheel, 줌 버튼, 프로그래매틱 줌 …) effectiveScale 만
 * 바꾸면 좌우 이동이 기반 동작으로 자동 상속된다. previewPan.test.ts 가 이 계약을 지킨다.
 */

export const MIN_USER_ZOOM = 1;
export const MAX_USER_ZOOM = 4;

export interface TouchPoint {
  clientX: number;
  clientY: number;
}

/** 핀치 두 터치 점 사이 거리. */
export function touchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/** startZoom × 거리 비율을 [MIN_USER_ZOOM, MAX_USER_ZOOM] 으로 clamp. */
export function nextZoom(startZoom: number, distanceRatio: number): number {
  return Math.min(Math.max(startZoom * distanceRatio, MIN_USER_ZOOM), MAX_USER_ZOOM);
}

/**
 * 확대된 콘텐츠 폭이 스크롤 포트보다 넘치는지(=가로 패닝 필요).
 * epsilon(기본 1px) 로 아슬아슬한 경계의 플립플롭을 방지한다.
 * calcScale 이 스케일 산출에만 -48 여유를 두므로 userZoom > 1 이라도 넘치지 않을 수
 * 있다(예: 375px 폰 × 1.1배) — 그래서 판정은 기하 기반이어야 한다.
 */
export function isHorizontallyPannable(
  contentWidth: number,
  containerWidth: number,
  epsilon = 1
): boolean {
  return contentWidth > containerWidth + epsilon;
}

/**
 * 스크롤 컨테이너의 touch-action 도출(기하 기반 — WHY 는 상단 모듈 주석).
 *  - 넘치지 않음 → "pan-y": 기존 동작 그대로. 가로 미세 흔들림이 스크롤로 오인돼 모바일
 *    탭 selection 이 포기되는 것(PM MouseDown.up allowDefault)을 줄인다.
 *  - 넘침 → "pan-x pan-y": 네이티브 좌우 패닝 허용(1손가락 드래그 이동).
 * 리터럴 문자열 자체가 CSS 계약이므로 테스트로 고정한다.
 */
export function deriveTouchAction(
  contentWidth: number,
  containerWidth: number
): "pan-y" | "pan-x pan-y" {
  return isHorizontallyPannable(contentWidth, containerWidth) ? "pan-x pan-y" : "pan-y";
}

export interface AnchoredScrollInput {
  /** 핀치 시작 중심점 아래 콘텐츠 좌표(unscaled px) — 제스처 동안 고정. */
  anchorUX: number;
  anchorUY: number;
  /** 현재 핀치 중심점(컨테이너 좌측/상단 기준 상대 좌표) — 손가락을 따라 갱신. */
  midX: number;
  midY: number;
  /** 렌더 후 scaledInner 위치(컨테이너 기준) — 새 스케일 레이아웃이 반영된 값. */
  innerLeft: number;
  innerTop: number;
  /** 보정 직전 스크롤 값(innerLeft/top 측정 시점의 것). */
  scrollLeft: number;
  scrollTop: number;
  /** 새 effectiveScale. */
  scale: number;
  /** 새 레이아웃 기준 최대 스크롤(scrollWidth/Height - clientWidth/Height). */
  maxScrollLeft: number;
  maxScrollTop: number;
}

/**
 * 핀치 앵커 스크롤 보정 — 줌이 transformOrigin "top left" 기준이라 중앙을 핀치하면 보던
 * 위치가 밀려나는 문제를, "시작 중심점 아래 콘텐츠가 현재 중심점을 따라가도록" 스크롤을
 * 맞춰 해결한다. 중심점 이동(핀치 중 2손가락 드래그)도 같은 수학으로 자연히 패닝된다.
 *
 *   scrollLeft' = scrollLeft + innerLeft + anchorUX × scale − midX  (→ [0, max] clamp)
 *
 * innerLeft 는 현재 scrollLeft 를 반영한 측정치이므로 scrollLeft 를 한 번 되돌려 더한다.
 * 호출 시점 주의: 래퍼 폭이 React 커밋으로 갱신된 뒤(useLayoutEffect)여야 새 scrollWidth
 * 로 clamp 된다 — touchmove 안에서 직접 할당하면 stale scrollWidth 로 잘린다.
 */
export function computeAnchoredScroll(input: AnchoredScrollInput): {
  scrollLeft: number;
  scrollTop: number;
} {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return {
    scrollLeft: clamp(
      input.scrollLeft + input.innerLeft + input.anchorUX * input.scale - input.midX,
      input.maxScrollLeft
    ),
    scrollTop: clamp(
      input.scrollTop + input.innerTop + input.anchorUY * input.scale - input.midY,
      input.maxScrollTop
    ),
  };
}
