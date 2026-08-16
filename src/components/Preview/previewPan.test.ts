import { describe, it, expect } from "vitest";
import {
  MIN_USER_ZOOM,
  MAX_USER_ZOOM,
  touchDistance,
  nextZoom,
  isHorizontallyPannable,
  deriveTouchAction,
  computeAnchoredScroll,
} from "./previewPan";

/**
 * previewPan 순수 로직 검증.
 * 핵심 회귀 방지: 가로 패닝(및 touch-action)은 **기하(overflow)에서 파생**한다 —
 * userZoom 조건으로 되돌려서 향후 줌 소스가 추가될 때 패닝이 깨지지 않게 한다.
 */

describe("touchDistance", () => {
  it("두 점 사이 유클리드 거리(3-4-5)", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });

  it("같은 점은 0", () => {
    expect(touchDistance({ clientX: 7, clientY: -2 }, { clientX: 7, clientY: -2 })).toBe(0);
  });

  it("인자 순서 무관(대칭)", () => {
    const a = { clientX: 10, clientY: 20 };
    const b = { clientX: 13, clientY: 24 };
    expect(touchDistance(a, b)).toBe(touchDistance(b, a));
  });
});

describe("nextZoom", () => {
  it("비율 1이면 시작 줌 그대로", () => {
    expect(nextZoom(1.7, 1)).toBe(1.7);
  });

  it("거리 비율을 곱한다 (1×2=2, 2×1.5=3, 1.5×2=3)", () => {
    expect(nextZoom(1, 2)).toBe(2);
    expect(nextZoom(2, 1.5)).toBe(3);
    expect(nextZoom(1.5, 2)).toBe(3);
  });

  it(`상한 ${MAX_USER_ZOOM} 클램프`, () => {
    expect(nextZoom(3, 2)).toBe(MAX_USER_ZOOM);
    expect(nextZoom(1, Infinity)).toBe(MAX_USER_ZOOM);
  });

  it(`하한 ${MIN_USER_ZOOM} 클램프`, () => {
    expect(nextZoom(2, 0.1)).toBe(MIN_USER_ZOOM);
    expect(nextZoom(1, 0)).toBe(MIN_USER_ZOOM);
  });
});

describe("isHorizontallyPannable", () => {
  it("콘텐츠가 포트보다 좁으면 false", () => {
    expect(isHorizontallyPannable(300, 375)).toBe(false);
  });

  it("폭이 같으면 false", () => {
    expect(isHorizontallyPannable(375, 375)).toBe(false);
  });

  it("기본 epsilon(1px) 이내 차이는 false — 경계 플립플롭 방지", () => {
    expect(isHorizontallyPannable(375.5, 375)).toBe(false);
  });

  it("포트보다 크면 true", () => {
    expect(isHorizontallyPannable(377, 375)).toBe(true);
  });

  it("epsilon 재정의 가능", () => {
    expect(isHorizontallyPannable(375.5, 375, 0.25)).toBe(true);
  });
});

describe("deriveTouchAction — 기하 기반 파생(CSS 계약 고정)", () => {
  it("넘치지 않으면 기존 동작 그대로 pan-y", () => {
    expect(deriveTouchAction(300, 375)).toBe("pan-y");
  });

  it("넘치면 pan-x pan-y (1손가락 좌우 패닝)", () => {
    expect(deriveTouchAction(750, 375)).toBe("pan-x pan-y");
  });

  it("회귀 방지: 48px 여유 때문에 작은 핀치줌(1.1×)은 여전히 pan-y — userZoom 조건이 아니라 기하로 판정한다", () => {
    // 375px 포트: fit scale ≈ (375-48)/794 ≈ 0.412 → 1.1배 = 359.8px < 375px → 넘치지 않음
    expect(deriveTouchAction(794 * 0.412 * 1.1, 375)).toBe("pan-y");
  });
});

describe("computeAnchoredScroll — 핀치 앵커 고정", () => {
  const large = { maxScrollLeft: 10_000, maxScrollTop: 10_000 };

  it("콘텐츠 원점(좌상단) 앵커는 스크롤 0으로 클램프 — 넘치지 않는 쪽으로 못 감", () => {
    const r = computeAnchoredScroll({
      anchorUX: 0,
      anchorUY: 0,
      midX: 150,
      midY: 200,
      innerLeft: 0,
      innerTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      scale: 2,
      ...large,
    });
    expect(r).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });

  it("중앙 앵커 2배 줌: 핀치 지점이 그대로 고정된다 (scrollLeft = mid×(s1/s0−1))", () => {
    // s0=1, mid=150, anchor=150 → s1=2 이면 scrollLeft=150
    const r = computeAnchoredScroll({
      anchorUX: 150,
      anchorUY: 0,
      midX: 150,
      midY: 0,
      innerLeft: 0,
      innerTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      scale: 2,
      ...large,
    });
    expect(r.scrollLeft).toBe(150);
  });

  it("핀치 중 2손가락 드래그(중심점 이동)도 패닝된다", () => {
    // 이미 scrollLeft=150(innerLeft=-150)인 상태에서 중심점을 150→170으로 옮기면 130으로 따라감
    const r = computeAnchoredScroll({
      anchorUX: 150,
      anchorUY: 0,
      midX: 170,
      midY: 0,
      innerLeft: -150,
      innerTop: 0,
      scrollLeft: 150,
      scrollTop: 0,
      scale: 2,
      ...large,
    });
    expect(r.scrollLeft).toBe(130);
  });

  it("maxScroll 클램프 — 페이지 끝을 넘어 스크롤하지 않는다", () => {
    const r = computeAnchoredScroll({
      anchorUX: 794,
      anchorUY: 0,
      midX: 10,
      midY: 0,
      innerLeft: 0,
      innerTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      scale: 2,
      maxScrollLeft: 1000,
      maxScrollTop: 1000,
    });
    expect(r.scrollLeft).toBe(1000);
  });

  it("가로로 넘치지 않으면(maxScroll=0) 세로만 보정", () => {
    const r = computeAnchoredScroll({
      anchorUX: 150,
      anchorUY: 300,
      midX: 150,
      midY: 200,
      innerLeft: 60, // 중앙정렬(auto margin) 상태
      innerTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      scale: 2,
      maxScrollLeft: 0,
      maxScrollTop: 10_000,
    });
    expect(r.scrollLeft).toBe(0);
    expect(r.scrollTop).toBe(400); // 300×2 − 200
  });

  it("세로 축도 같은 수학으로 동작", () => {
    const r = computeAnchoredScroll({
      anchorUX: 0,
      anchorUY: 300,
      midX: 0,
      midY: 300,
      innerLeft: 0,
      innerTop: -100, // scrollTop=100
      scrollLeft: 0,
      scrollTop: 100,
      scale: 2,
      ...large,
    });
    expect(r.scrollTop).toBe(300); // 100 − 100 + 600 − 300
  });
});
