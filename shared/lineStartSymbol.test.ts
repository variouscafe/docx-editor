import { describe, it, expect } from "vitest";
import {
  LineStartSymbol,
  resolveCounter,
  getSymbolDisplay,
  isBoldSymbol,
  isCounterSymbol,
  isContentBracket,
} from "./lineStartSymbol";

describe("resolveCounter — 자동 카운터 기호", () => {
  it("NUMBER_DOT/NUMBER_PAREN 은 index 를 그대로 붙인다", () => {
    expect(resolveCounter(LineStartSymbol.NUMBER_DOT, 1)).toBe("1.");
    expect(resolveCounter(LineStartSymbol.NUMBER_DOT, 12)).toBe("12.");
    expect(resolveCounter(LineStartSymbol.NUMBER_PAREN, 3)).toBe("3)");
  });

  it("ROMAN 은 1~12 까지 유니코드 로마숫자(Ⅰ~Ⅻ)", () => {
    expect(resolveCounter(LineStartSymbol.ROMAN, 1)).toBe("Ⅰ");
    expect(resolveCounter(LineStartSymbol.ROMAN, 2)).toBe("Ⅱ");
    expect(resolveCounter(LineStartSymbol.ROMAN, 12)).toBe("Ⅻ");
  });

  it("ROMAN 13 이상은 ASCII 폴백", () => {
    expect(resolveCounter(LineStartSymbol.ROMAN, 13)).toBe("13");
  });

  it("CIRCLED 는 1~20 까지 원문자(①~⑳)", () => {
    expect(resolveCounter(LineStartSymbol.CIRCLED, 1)).toBe("①");
    expect(resolveCounter(LineStartSymbol.CIRCLED, 2)).toBe("②");
    expect(resolveCounter(LineStartSymbol.CIRCLED, 20)).toBe("⑳");
  });

  it("CIRCLED 21 이상은 (n) 폴백", () => {
    expect(resolveCounter(LineStartSymbol.CIRCLED, 21)).toBe("(21)");
  });

  it("비카운터 기호는 getSymbolDisplay 로 폴백(카운터 무시)", () => {
    expect(resolveCounter(LineStartSymbol.SQUARE, 5)).toBe("□");
    expect(resolveCounter(LineStartSymbol.DASH, 5)).toBe("-");
    expect(resolveCounter(LineStartSymbol.BULLET, 5)).toBe("•");
  });
});

describe("getSymbolDisplay", () => {
  it("모든 기호의 대표 문자열", () => {
    expect(getSymbolDisplay(LineStartSymbol.NUMBER_DOT)).toBe("1.");
    expect(getSymbolDisplay(LineStartSymbol.NUMBER_PAREN)).toBe("1)");
    expect(getSymbolDisplay(LineStartSymbol.ROMAN)).toBe("Ⅰ");
    expect(getSymbolDisplay(LineStartSymbol.CIRCLED)).toBe("①");
    expect(getSymbolDisplay(LineStartSymbol.SQUARE)).toBe("□");
    expect(getSymbolDisplay(LineStartSymbol.DASH)).toBe("-");
    expect(getSymbolDisplay(LineStartSymbol.BULLET)).toBe("•");
    expect(getSymbolDisplay(LineStartSymbol.CONTENT_BRACKET)).toBe("【】");
  });
});

describe("기호 분류 헬퍼", () => {
  it("isBoldSymbol — 1., 1), □, Ⅰ 만 굵게", () => {
    expect(isBoldSymbol(LineStartSymbol.NUMBER_DOT)).toBe(true);
    expect(isBoldSymbol(LineStartSymbol.NUMBER_PAREN)).toBe(true);
    expect(isBoldSymbol(LineStartSymbol.SQUARE)).toBe(true);
    expect(isBoldSymbol(LineStartSymbol.ROMAN)).toBe(true);
    expect(isBoldSymbol(LineStartSymbol.DASH)).toBe(false);
    expect(isBoldSymbol(LineStartSymbol.BULLET)).toBe(false);
    expect(isBoldSymbol(LineStartSymbol.CIRCLED)).toBe(false);
    expect(isBoldSymbol(LineStartSymbol.CONTENT_BRACKET)).toBe(false);
  });

  it("isCounterSymbol — NUMBER_DOT/NUMBER_PAREN/ROMAN/CIRCLED 만 카운터", () => {
    expect(isCounterSymbol(LineStartSymbol.NUMBER_DOT)).toBe(true);
    expect(isCounterSymbol(LineStartSymbol.NUMBER_PAREN)).toBe(true);
    expect(isCounterSymbol(LineStartSymbol.ROMAN)).toBe(true);
    expect(isCounterSymbol(LineStartSymbol.CIRCLED)).toBe(true);
    expect(isCounterSymbol(LineStartSymbol.SQUARE)).toBe(false);
    expect(isCounterSymbol(LineStartSymbol.DASH)).toBe(false);
    expect(isCounterSymbol(LineStartSymbol.BULLET)).toBe(false);
    expect(isCounterSymbol(LineStartSymbol.CONTENT_BRACKET)).toBe(false);
  });

  it("isContentBracket — CONTENT_BRACKET 만 true", () => {
    expect(isContentBracket(LineStartSymbol.CONTENT_BRACKET)).toBe(true);
    expect(isContentBracket(LineStartSymbol.SQUARE)).toBe(false);
  });
});
