/**
 * 헤딩 prefix 계산 — FE 미리보기 장식·BE docx 생성기가 공유.
 * 카운터 상태(counters)는 호출자가 관리하고, 여기서는 순수 계산만 수행.
 */
import {
  LineStartSymbol,
  resolveCounter,
  isBoldSymbol,
} from "./lineStartSymbol";

export type HeadingKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type Counters = Record<HeadingKey, number>;

export function createCounters(): Counters {
  return { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
}

/** 기호별 선행 공백 강제 규칙: □=1칸, -=4칸, •=4칸 */
export function getEffectiveLeadingSpaces(
  symbol: LineStartSymbol,
  configuredSpaces: number
): number {
  if (symbol === LineStartSymbol.SQUARE) return 1;
  if (symbol === LineStartSymbol.DASH) return 4;
  if (symbol === LineStartSymbol.BULLET) return 4;
  return configuredSpaces;
}

export interface HeadingPrefix {
  /** 선행공백 + 기호 + 후행공백(예: "    • ") */
  prefixText: string;
  /** 기호 자체가 굵게 표시되어야 하는지 */
  bold: boolean;
}

/**
 * 헤딩에 붙일 prefix를 계산.
 * @param symbol      해당 헤딩의 lineStartSymbol
 * @param configured  옵션에 설정된 leadingSpaces
 * @param count       1-based 카운터 값 (호출자가 ++counters[key] 한 결과)
 */
export function buildHeadingPrefix(
  symbol: LineStartSymbol,
  configured: number,
  count: number
): HeadingPrefix {
  // 기호 없음 — prefix 자체를 붙이지 않음(빈 텍스트 노드 삽입 방지를 위해 호출자도 건너뜀).
  if (symbol === LineStartSymbol.NONE) return { prefixText: "", bold: false };
  const leading = " ".repeat(getEffectiveLeadingSpaces(symbol, configured));
  // resolveCounter 는 비카운터 기호에 대해 getSymbolDisplay 로 폴백 → h1~h6 모두 동일 처리.
  const symbolText = resolveCounter(symbol, count);
  return {
    prefixText: `${leading}${symbolText} `,
    bold: isBoldSymbol(symbol),
  };
}
