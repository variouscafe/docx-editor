import { LineStartSymbol } from "./lineStartSymbol";

/** Word식 줄 간격 규칙. */
export type LineSpacingRule =
  | "single"
  | "1.15"
  | "1.5"
  | "double"
  | "atLeast"
  | "exact"
  | "multiple";

/**
 * 줄 간격(Line Spacing) — 자동 줄바꿈된 줄 사이의 간격.
 * - single/1.15/1.5/double: 고정 배수
 * - atLeast(최소값)/exact(정확히): value = pt
 * - multiple(배수): value = 배수(1.0, 1.5, 3 ...)
 */
export interface LineSpacing {
  rule: LineSpacingRule;
  value?: number;
}

/**
 * 단락 간격 3종 — 모든 블록 섹션 공통.
 * - paragraphSpacing(단락 뒤): Enter 로 단락이 끝난 뒤 다음 단락과의 간격(pt)
 * - spacingBefore(단락 앞): 단락 시작 전 여백(pt)
 * - lineSpacing(줄 간격)
 */
export interface SpacingFields {
  paragraphSpacing: number;
  spacingBefore: number;
  lineSpacing: LineSpacing;
}

export interface CommonOptions extends SpacingFields {
  fontSize: number;
  fontFamily: string;
  marginTop: number; // cm
  marginBottom: number; // cm
  marginLeft: number; // cm
  marginRight: number; // cm
}

export interface H1Options extends SpacingFields {
  fontSize: number;
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
  bold: boolean;
}

export interface H2Options extends SpacingFields {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H3Options extends SpacingFields {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H4Options extends SpacingFields {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H5Options extends SpacingFields {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H6Options extends SpacingFields {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface TitleOptions extends SpacingFields {
  fontSize: number;
  bold: boolean;
  underline: boolean;
  align: string;
}

export interface Annotation1Options {
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface Annotation2Options extends SpacingFields {
  fontSize: number;
  symbol: string;
}

export interface DocxOptions {
  common: CommonOptions;
  title: TitleOptions;
  h1: H1Options;
  h2: H2Options;
  h3: H3Options;
  h4: H4Options;
  h5: H5Options;
  h6: H6Options;
  annotation1: Annotation1Options;
  annotation2: Annotation2Options;
  annotationMode: 1 | 2;
}

const BATANG =
  "Batang, BatangChe, 바탕, 바탕체, 'Batang Che', 'Nanum Myeongjo', AppleMyungjo, serif";

/** 기본 줄 간격 — 현재 미리보기 line-height(1.6)와 일치. 미리보기↔DOCX 불일치 해소. */
export const DEFAULT_LINE_SPACING: LineSpacing = { rule: "multiple", value: 1.6 };

export const defaultOptions: DocxOptions = {
  common: {
    fontSize: 14,
    paragraphSpacing: 12,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    fontFamily: BATANG,
    marginTop: 2,
    marginBottom: 2,
    marginLeft: 2,
    marginRight: 2,
  },
  title: {
    fontSize: 20,
    bold: true,
    underline: true,
    align: "center",
    paragraphSpacing: 24,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
  },
  h1: {
    paragraphSpacing: 24,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    fontSize: 24,
    lineStartSymbol: LineStartSymbol.NUMBER_DOT,
    leadingSpaces: 0,
    bold: true,
  },
  h2: {
    paragraphSpacing: 16,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    lineStartSymbol: LineStartSymbol.SQUARE,
    leadingSpaces: 1,
  },
  h3: {
    paragraphSpacing: 12,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    lineStartSymbol: LineStartSymbol.DASH,
    leadingSpaces: 4,
  },
  h4: {
    paragraphSpacing: 16,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    lineStartSymbol: LineStartSymbol.BULLET,
    leadingSpaces: 4,
  },
  h5: {
    paragraphSpacing: 12,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    lineStartSymbol: LineStartSymbol.ROMAN,
    leadingSpaces: 0,
  },
  h6: {
    paragraphSpacing: 12,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    lineStartSymbol: LineStartSymbol.CIRCLED,
    leadingSpaces: 0,
  },
  annotation1: {
    fontSize: 10,
    fontFamily: BATANG,
    color: "#0000FF",
  },
  annotation2: {
    fontSize: 12,
    paragraphSpacing: 16,
    spacingBefore: 0,
    lineSpacing: { ...DEFAULT_LINE_SPACING },
    symbol: "○",
  },
  annotationMode: 1,
};

/* ── 간격 해석 헬퍼 (FE 미리보기·BE DOCX 공용 → 단일 진실) ─────────── */

export interface ResolvedLineSpacing {
  /** docx spacing.line/lineRule. 미정의면 줄 간격 생략(Word 기본). */
  docx?: { line: number; lineRule: "auto" | "exact" | "atLeast" };
  /** CSS line-height 값(숫자 배수 또는 "${pt}pt"). */
  css: string;
}

/** 줄 간격 → docx(line/lineRule, 240=1.0 단위) + css(line-height). */
export function resolveLineSpacing(ls: LineSpacing | undefined): ResolvedLineSpacing {
  const rule = ls?.rule ?? "multiple";
  const value = ls?.value;
  switch (rule) {
    case "single":
      return { docx: { line: 240, lineRule: "auto" }, css: "1" };
    case "1.15":
      return { docx: { line: 276, lineRule: "auto" }, css: "1.15" };
    case "1.5":
      return { docx: { line: 360, lineRule: "auto" }, css: "1.5" };
    case "double":
      return { docx: { line: 480, lineRule: "auto" }, css: "2" };
    case "atLeast": {
      const v = value ?? 0;
      return { docx: { line: Math.round(v * 20), lineRule: "atLeast" }, css: `${v}pt` };
    }
    case "exact": {
      const v = value ?? 0;
      return { docx: { line: Math.round(v * 20), lineRule: "exact" }, css: `${v}pt` };
    }
    case "multiple":
    default: {
      const v = value ?? DEFAULT_LINE_SPACING.value ?? 1.6;
      return { docx: { line: Math.round(v * 240), lineRule: "auto" }, css: String(v) };
    }
  }
}

export interface ResolvedSpacing {
  beforePt: number;
  afterPt: number;
  /** docx ISpacingProperties 호환 객체. */
  docx: { before: number; after: number; line?: number; lineRule?: "auto" | "exact" | "atLeast" };
  /** CSS 용 pt 문자열. */
  css: { marginTop: string; marginBottom: string; lineHeight: string };
}

/** 섹션 간격 → docx spacing 객체(before/after=pt*20 twips) + CSS 문자열. */
export function resolveSpacing(s: SpacingFields): ResolvedSpacing {
  const beforePt = s.spacingBefore ?? 0;
  const afterPt = s.paragraphSpacing ?? 0;
  const ls = resolveLineSpacing(s.lineSpacing);
  return {
    beforePt,
    afterPt,
    docx: { before: beforePt * 20, after: afterPt * 20, ...(ls.docx ?? {}) },
    css: {
      marginTop: `${beforePt}pt`,
      marginBottom: `${afterPt}pt`,
      lineHeight: ls.css,
    },
  };
}

/* ── 구 데이터 보정 ───────────────────────────────────────────── */

type AnySection = Partial<SpacingFields>;
type RawH4 = AnySection & {
  lineStartSymbol?: LineStartSymbol;
  leadingSpaces?: number;
  singleLineSpacing?: number; // 구 필드(deprecated)
  secondLineSpacing?: number; // 구 필드(deprecated)
};
type RawOptions = Partial<Omit<DocxOptions, "h4">> & { h4?: RawH4 };

const num = (v: unknown, fb: number): number => (typeof v === "number" ? v : fb);

const fillSpacing = (s: AnySection | undefined, fb: number): SpacingFields => ({
  paragraphSpacing: num(s?.paragraphSpacing, fb),
  spacingBefore: num(s?.spacingBefore, 0),
  lineSpacing: s?.lineSpacing ?? { ...DEFAULT_LINE_SPACING },
});

/** 구 H4 에서 deprecated single/secondLineSpacing 제거. */
const stripH4Old = (h4?: RawH4): AnySection => {
  if (!h4) return {};
  const { singleLineSpacing: _s, secondLineSpacing: _ss, ...rest } = h4;
  return rest;
};

/**
 * 저장된 JSON(필드 누락·구 H4 single/second 포함)을 현 모델로 보정.
 * 저장 포맷은 건드리지 않고 메모리에서만 정규화 → 기존 문서 외관 유지.
 */
export function normalizeOptions(input: unknown): DocxOptions {
  const o = (input ?? {}) as RawOptions;
  const commonPs = num(o.common?.paragraphSpacing, 12);

  return {
    ...defaultOptions,
    ...o,
    common: { ...defaultOptions.common, ...o.common, ...fillSpacing(o.common, 12) },
    title: { ...defaultOptions.title, ...o.title, ...fillSpacing(o.title, 24) },
    h1: { ...defaultOptions.h1, ...o.h1, ...fillSpacing(o.h1, 24) },
    h2: { ...defaultOptions.h2, ...o.h2, ...fillSpacing(o.h2, 16) },
    h3: { ...defaultOptions.h3, ...o.h3, ...fillSpacing(o.h3, commonPs) },
    h4: {
      ...defaultOptions.h4,
      ...stripH4Old(o.h4),
      ...fillSpacing(
        stripH4Old(o.h4),
        num(o.h4?.singleLineSpacing ?? o.h4?.secondLineSpacing, num(commonPs, 16)),
      ),
    },
    h5: { ...defaultOptions.h5, ...o.h5, ...fillSpacing(o.h5, commonPs) },
    h6: { ...defaultOptions.h6, ...o.h6, ...fillSpacing(o.h6, commonPs) },
    annotation1: { ...defaultOptions.annotation1, ...o.annotation1 },
    annotation2: { ...defaultOptions.annotation2, ...o.annotation2, ...fillSpacing(o.annotation2, 16) },
    annotationMode: o.annotationMode ?? 1,
  };
}
