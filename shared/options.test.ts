import { describe, it, expect } from "vitest";
import {
  normalizeOptions,
  resolveLineSpacing,
  resolveSpacing,
  defaultOptions,
  DEFAULT_LINE_SPACING,
} from "./options";

describe("normalizeOptions — 구 데이터 보정", () => {
  it("빈 입력 → 각 섹션 기본값/기호 채움", () => {
    const o = normalizeOptions({});
    expect(o.common.fontSize).toBe(14);
    expect(o.common.paragraphSpacing).toBe(12);
    expect(o.common.lineSpacing).toEqual(DEFAULT_LINE_SPACING);
    expect(o.title.fontSize).toBe(20);
    expect(o.h1.fontSize).toBe(24);
    expect(o.h1.lineStartSymbol).toBe("NUMBER_DOT");
    expect(o.h2.lineStartSymbol).toBe("SQUARE");
    expect(o.h2.leadingSpaces).toBe(1);
    expect(o.h3.lineStartSymbol).toBe("DASH");
    expect(o.h3.leadingSpaces).toBe(4);
    expect(o.h4.lineStartSymbol).toBe("BULLET");
    expect(o.h4.leadingSpaces).toBe(4);
    expect(o.annotationMode).toBe(1);
  });

  it("null/undefined 도 안전(기본값 채움)", () => {
    expect(normalizeOptions(null).common.fontSize).toBe(14);
    expect(normalizeOptions(undefined).h1.fontSize).toBe(24);
  });

  // ⚠️ 기록된 현재 동작: normalizeOptions 는 h4.paragraphSpacing 을 commonPs(12)로
  // 폴백한다. defaultOptions.h4.paragraphSpacing(=16) 및 CLAUDE.md H4 규격(16pt)과 다름.
  // 별도 이슈로 보고됨 — 수정 시 이 기대값을 16으로 올릴 것.
  it("h4.paragraphSpacing 현재 폴백값 = 12 (defaultOptions 의 16 과 상이 — 알려진 이슈)", () => {
    expect(normalizeOptions({}).h4.paragraphSpacing).toBe(12);
  });

  it("부분 common.fontSize 만 넣어도 나머지는 기본값 + 간격 채움", () => {
    const o = normalizeOptions({ common: { fontSize: 20 } });
    expect(o.common.fontSize).toBe(20);
    expect(o.common.fontFamily).toBe(defaultOptions.common.fontFamily);
    expect(o.common.paragraphSpacing).toBe(12);
    expect(o.common.lineSpacing).toEqual(DEFAULT_LINE_SPACING);
  });

  it("deprecated H4 singleLineSpacing/secondLineSpacing 제거 + 간격 폴백", () => {
    const o = normalizeOptions({
      h4: { singleLineSpacing: 99, secondLineSpacing: 88, leadingSpaces: 4 },
    } as never);
    expect((o.h4 as never as { singleLineSpacing?: number }).singleLineSpacing).toBeUndefined();
    // singleLineSpacing 99 → paragraphSpacing 폴백
    expect(o.h4.paragraphSpacing).toBe(99);
  });

  it("저장된 h4.paragraphSpacing 은 보존(12 → 12)", () => {
    const o = normalizeOptions({ h4: { paragraphSpacing: 12 } } as never);
    expect(o.h4.paragraphSpacing).toBe(12);
  });

  it("annotationMode 기본 1", () => {
    expect(normalizeOptions({}).annotationMode).toBe(1);
    expect(normalizeOptions({ annotationMode: 2 }).annotationMode).toBe(2);
  });
});

describe("resolveLineSpacing — docx(line/lineRule) ↔ css 동치", () => {
  it("single → line 240 / css 1", () => {
    expect(resolveLineSpacing({ rule: "single" })).toEqual({
      docx: { line: 240, lineRule: "auto" },
      css: "1",
    });
  });
  it("1.15 → 276 / 1.5 → 360 / double → 480", () => {
    expect(resolveLineSpacing({ rule: "1.15" }).docx).toEqual({ line: 276, lineRule: "auto" });
    expect(resolveLineSpacing({ rule: "1.5" }).docx).toEqual({ line: 360, lineRule: "auto" });
    expect(resolveLineSpacing({ rule: "double" }).docx).toEqual({ line: 480, lineRule: "auto" });
  });
  it("multiple 1.6 → line 384 / css 1.6", () => {
    expect(resolveLineSpacing({ rule: "multiple", value: 1.6 })).toEqual({
      docx: { line: 384, lineRule: "auto" },
      css: "1.6",
    });
  });
  it("exact 16pt → line 320 lineRule exact / css 16pt", () => {
    expect(resolveLineSpacing({ rule: "exact", value: 16 })).toEqual({
      docx: { line: 320, lineRule: "exact" },
      css: "16pt",
    });
  });
  it("atLeast 12pt → line 240 lineRule atLeast / css 12pt", () => {
    expect(resolveLineSpacing({ rule: "atLeast", value: 12 })).toEqual({
      docx: { line: 240, lineRule: "atLeast" },
      css: "12pt",
    });
  });
  it("undefined → 기본 multiple 1.6", () => {
    expect(resolveLineSpacing(undefined).css).toBe("1.6");
  });
});

describe("resolveSpacing — 단락 간격 3종", () => {
  it("before/after pt → docx twips + css pt 동치", () => {
    const r = resolveSpacing({
      paragraphSpacing: 12,
      spacingBefore: 6,
      lineSpacing: { rule: "single" },
    });
    expect(r.beforePt).toBe(6);
    expect(r.afterPt).toBe(12);
    expect(r.docx).toEqual({ before: 120, after: 240, line: 240, lineRule: "auto" });
    expect(r.css).toEqual({ marginTop: "6pt", marginBottom: "12pt", lineHeight: "1" });
  });
});
