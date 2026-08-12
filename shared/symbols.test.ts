import { describe, it, expect } from "vitest";
import {
  buildHeadingPrefix,
  createCounters,
  getEffectiveLeadingSpaces,
} from "./symbols";
import { LineStartSymbol } from "./lineStartSymbol";

describe("getEffectiveLeadingSpaces — 선행 공백 강제 규칙", () => {
  it("SQUARE 는 설정값 무시 1칸 강제", () => {
    expect(getEffectiveLeadingSpaces(LineStartSymbol.SQUARE, 0)).toBe(1);
    expect(getEffectiveLeadingSpaces(LineStartSymbol.SQUARE, 5)).toBe(1);
  });

  it("DASH 는 4칸 강제", () => {
    expect(getEffectiveLeadingSpaces(LineStartSymbol.DASH, 0)).toBe(4);
    expect(getEffectiveLeadingSpaces(LineStartSymbol.DASH, 2)).toBe(4);
  });

  it("BULLET 은 4칸 강제", () => {
    expect(getEffectiveLeadingSpaces(LineStartSymbol.BULLET, 0)).toBe(4);
    expect(getEffectiveLeadingSpaces(LineStartSymbol.BULLET, 1)).toBe(4);
  });

  it("그 외 기호는 설정값 그대로", () => {
    expect(getEffectiveLeadingSpaces(LineStartSymbol.NUMBER_DOT, 0)).toBe(0);
    expect(getEffectiveLeadingSpaces(LineStartSymbol.NUMBER_DOT, 3)).toBe(3);
    expect(getEffectiveLeadingSpaces(LineStartSymbol.ROMAN, 2)).toBe(2);
  });
});

describe("buildHeadingPrefix — prefixText 조합", () => {
  it("NUMBER_DOT: 카운터 반영 + 설정 선행공백 + 굵게", () => {
    const p1 = buildHeadingPrefix(LineStartSymbol.NUMBER_DOT, 0, 1);
    expect(p1.prefixText).toBe("1. ");
    expect(p1.bold).toBe(true);

    const p2 = buildHeadingPrefix(LineStartSymbol.NUMBER_DOT, 0, 2);
    expect(p2.prefixText).toBe("2. ");
  });

  it("SQUARE: 설정 5여도 1칸 강제 → ' □ '", () => {
    const p = buildHeadingPrefix(LineStartSymbol.SQUARE, 5, 1);
    expect(p.prefixText).toBe(" □ ");
    expect(p.bold).toBe(true); // □ 는 굵은 기호
  });

  it("DASH: 4칸 강제 + 굵게 아님", () => {
    const p = buildHeadingPrefix(LineStartSymbol.DASH, 0, 1);
    expect(p.prefixText).toBe("    - ");
    expect(p.bold).toBe(false);
  });

  it("BULLET: 4칸 강제 + 굵게 아님", () => {
    const p = buildHeadingPrefix(LineStartSymbol.BULLET, 0, 1);
    expect(p.prefixText).toBe("    • ");
    expect(p.bold).toBe(false);
  });

  it("ROMAN: 카운터 → 로마숫자 + 굵게", () => {
    const p = buildHeadingPrefix(LineStartSymbol.ROMAN, 0, 3);
    expect(p.prefixText).toBe("Ⅲ ");
    expect(p.bold).toBe(true);
  });

  it("CIRCLED: 카운터 → 원문자 + 굵게 아님", () => {
    const p = buildHeadingPrefix(LineStartSymbol.CIRCLED, 0, 2);
    expect(p.prefixText).toBe("② ");
    expect(p.bold).toBe(false);
  });

  it("NONE: prefix 없음 → 빈 prefixText", () => {
    const p = buildHeadingPrefix(LineStartSymbol.NONE, 3, 1);
    expect(p.prefixText).toBe("");
    expect(p.bold).toBe(false);
  });
});

describe("createCounters", () => {
  it("모든 헤딩 레벨이 0 으로 초기화", () => {
    const c = createCounters();
    expect(c).toEqual({ h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 });
  });
});
