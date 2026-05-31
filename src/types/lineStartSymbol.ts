export const LineStartSymbol = {
  NUMBER_DOT: "NUMBER_DOT",
  NUMBER_PAREN: "NUMBER_PAREN",
  ROMAN: "ROMAN",
  CIRCLED: "CIRCLED",
  SQUARE: "SQUARE",
  DASH: "DASH",
  BULLET: "BULLET",
  CONTENT_BRACKET: "CONTENT_BRACKET",
} as const;

export type LineStartSymbol = (typeof LineStartSymbol)[keyof typeof LineStartSymbol];

export const ALL_SYMBOLS: LineStartSymbol[] = [
  LineStartSymbol.NUMBER_DOT,
  LineStartSymbol.NUMBER_PAREN,
  LineStartSymbol.ROMAN,
  LineStartSymbol.CIRCLED,
  LineStartSymbol.SQUARE,
  LineStartSymbol.DASH,
  LineStartSymbol.BULLET,
  LineStartSymbol.CONTENT_BRACKET,
];

/** 드롭다운 등 UI에 표시할 대표 문자열 */
export function getSymbolDisplay(symbol: LineStartSymbol): string {
  switch (symbol) {
    case LineStartSymbol.NUMBER_DOT:
      return "1.";
    case LineStartSymbol.NUMBER_PAREN:
      return "1)";
    case LineStartSymbol.ROMAN:
      return "Ⅰ";
    case LineStartSymbol.CIRCLED:
      return "①";
    case LineStartSymbol.SQUARE:
      return "□";
    case LineStartSymbol.DASH:
      return "-";
    case LineStartSymbol.BULLET:
      return "•";
    case LineStartSymbol.CONTENT_BRACKET:
      return "【】";
  }
}

/** 【】괄호 기호인지 여부 — 선택 시 헤딩 텍스트가 괄호 안에 들어감 */
export function isContentBracket(symbol: LineStartSymbol): boolean {
  return symbol === LineStartSymbol.CONTENT_BRACKET;
}

/** 자동 카운터가 적용되는 기호인지 여부 */
export function isCounterSymbol(symbol: LineStartSymbol): boolean {
  return (
    symbol === LineStartSymbol.NUMBER_DOT ||
    symbol === LineStartSymbol.NUMBER_PAREN ||
    symbol === LineStartSymbol.ROMAN ||
    symbol === LineStartSymbol.CIRCLED
  );
}

/** 1-based index를 받아 실제 표시할 기호 문자열을 반환 */
export function resolveCounter(symbol: LineStartSymbol, index: number): string {
  switch (symbol) {
    case LineStartSymbol.NUMBER_DOT:
      return `${index}.`;
    case LineStartSymbol.NUMBER_PAREN:
      return `${index})`;
    case LineStartSymbol.ROMAN:
      return toRoman(index);
    case LineStartSymbol.CIRCLED:
      return toCircled(index);
    default:
      return getSymbolDisplay(symbol);
  }
}

/** 로마 숫자 변환 (Ⅰ, Ⅱ, Ⅲ, Ⅳ, Ⅴ, ...) */
function toRoman(n: number): string {
  const base = 0x215f; // Ⅰ = U+2160, offset from 0x215f
  if (n >= 1 && n <= 12) {
    return String.fromCodePoint(base + n);
  }
  // Fallback for numbers > 12
  const romans = [
    "",
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ];
  return romans[n] || String(n);
}

/** 원문자 숫자 변환 (①, ②, ③, ...) */
function toCircled(n: number): string {
  if (n >= 1 && n <= 20) {
    // ① = U+2460
    return String.fromCodePoint(0x245f + n);
  }
  return `(${n})`;
}
