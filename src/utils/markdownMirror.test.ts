import { describe, it, expect } from "vitest";
import type { JSONContent } from "@shared/runs";
import { jsonToMarkdown } from "./jsonToMarkdown";
import { markdownToHtml } from "./markdownToHtml";

/**
 * content_md 미러 round-trip — 원문의 마크다운 메타문자가 커스텀 문법으로 오변환되지
 * 않는지(이스케이프·센티널 보호)와 실제 마크는 문법으로 직렬화되는지 검증.
 */

const para = (text: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

describe("jsonToMarkdown — 메타문자 이스케이프", () => {
  it("대괄호 본문이 핵심요약으로 오변환되지 않는다", () => {
    const md = jsonToMarkdown({ type: "doc", content: [para("[참고] 사항입니다")] });
    expect(md).toContain("\\[참고\\]");
    // 재반입 시 원문 그대로 복원(핵심요약 span 미생성)
    const html = markdownToHtml(md);
    expect(html).toContain("[참고]");
    expect(html).not.toContain("data-core-summary");
  });

  it("'==' 비교식이 형광펜으로 오변환되지 않는다", () => {
    const md = jsonToMarkdown({ type: "doc", content: [para("a == b == c")] });
    const html = markdownToHtml(md);
    expect(html).toContain("a == b == c");
    expect(html).not.toContain("<mark");
  });

  it("밑줄 문법 충돌 문자(^^, ++, ~~)가 원문 그대로 유지된다", () => {
    const md = jsonToMarkdown({ type: "doc", content: [para("x ~~ y ++ z ^^ w {{ v")] });
    const html = markdownToHtml(md);
    expect(html).toContain("x ~~ y ++ z ^^ w {{ v");
    expect(html).not.toContain("data-border");
    expect(html).not.toContain("<u>");
    expect(html).not.toContain("data-annotation");
  });

  it("별표가 이탤릭으로 오변환되지 않는다", () => {
    const md = jsonToMarkdown({ type: "doc", content: [para("2 * 3 * 4")] });
    const html = markdownToHtml(md);
    expect(html).toContain("2 * 3 * 4");
    expect(html).not.toContain("<em>");
  });

  it("실제 마크는 여전히 커스텀 문법으로 직렬화된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("형광", [{ type: "highlight", attrs: { color: "#fef08a" } }]),
        para("박스", [{ type: "boxBorder", attrs: { "data-border": "solid" } }]),
        para("주석", [{ type: "annotation", attrs: { "data-annotation": "부연" } }]),
      ],
    });
    expect(md).toContain("==형광==");
    expect(md).toContain("++박스++");
    expect(md).toContain("{{주석|부연}}");
    const html = markdownToHtml(md);
    expect(html).toContain("<mark");
    expect(html).toContain('data-border="solid"');
    expect(html).toContain('data-annotation="부연"');
  });
});

describe("jsonToMarkdown — 블록 이미지", () => {
  it("이미지 노드 → ![alt](src) 미러 + 재반입 시 <img> 복원", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "/api/images/00000000-0000-4000-8000-000000000000", alt: "캡처" },
        },
      ],
    });
    expect(md).toContain(
      "![캡처](/api/images/00000000-0000-4000-8000-000000000000)",
    );
    // marked(GFM) 가 ![alt](src) → <img> 로 렌더 — 마크다운 가져오기 round-trip.
    const html = markdownToHtml(md);
    expect(html).toContain("<img");
    expect(html).toContain('src="/api/images/00000000-0000-4000-8000-000000000000"');
  });

  it("캡션(설명) attrs 가 alt 보다 우선 미러링된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [{ type: "image", attrs: { src: "/api/images/x", alt: "파일명", caption: "그림 설명" } }],
    });
    expect(md).toContain("![그림 설명](/api/images/x)");
  });

  it("alt 의 대괄호는 제거해 문법 파손 방지, src 없으면 생략", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "/api/images/x", alt: "a[b]" } },
        { type: "image", attrs: { alt: "no-src" } },
      ],
    });
    expect(md).toContain("![ab](/api/images/x)");
    expect(md).not.toContain("![no-src]");
  });
});
