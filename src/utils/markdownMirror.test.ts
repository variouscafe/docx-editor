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

describe("content_md 미러 round-trip — 중첩 마크 보존", () => {
  it("박스 안 굵게(++**x**++)가 리터럴 ** 로 새지 않고 <strong> 로 복원된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("굵게", [
          { type: "boxBorder", attrs: { "data-border": "solid" } },
          { type: "bold" },
        ]),
      ],
    });
    const html = markdownToHtml(md);
    // wrapMarks 순서상 `**++x++**` 로 직렬화 → strong 이 바깥. PM 마크는 집합이므로 순서 무관.
    expect(html).toContain('<strong><span data-border="solid">굵게</span></strong>');
    expect(html).not.toContain("**");
  });

  it("형광펜 안 굵게/이탤릭이 보존된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("강조", [
          { type: "highlight", attrs: { color: "#fef08a" } },
          { type: "bold" },
        ]),
        para("기울임", [
          { type: "highlight", attrs: { color: "#fef08a" } },
          { type: "italic" },
        ]),
      ],
    });
    const html = markdownToHtml(md);
    expect(html).toContain('<strong><mark data-color="#fef08a">강조</mark></strong>');
    expect(html).toContain('<em><mark data-color="#fef08a">기울임</mark></em>');
  });

  it("꼬마글씨 본문 안 인라인 마크가 보존된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("Claude Code", [
          { type: "annotation", attrs: { "data-annotation": '부연 "인용부"' } },
          { type: "bold" },
        ]),
      ],
    });
    const html = markdownToHtml(md);
    expect(html).toContain("data-annotation=");
    expect(html).toContain("<strong>Claude Code</strong>");
    expect(html).not.toContain("**");
  });

  it("핵심요약 안 굵게가 보존된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [para("핵심", [{ type: "coreSummary" }, { type: "bold" }])],
    });
    const html = markdownToHtml(md);
    expect(html).toContain('<strong><span data-core-summary="true">핵심</span></strong>');
  });
});

describe("content_md 미러 round-trip — 문단 선두 구조 토큰", () => {
  it("'1. 사과' 문단이 ordered list 로 바뀌지 않는다", () => {
    const md = jsonToMarkdown({ type: "doc", content: [para("1. 사과")] });
    const html = markdownToHtml(md);
    expect(html).toContain("1. 사과");
    expect(html).not.toContain("<ol>");
  });

  it("'- 목록' 문단이 bullet list 로 바뀌지 않는다", () => {
    const html = markdownToHtml(jsonToMarkdown({ type: "doc", content: [para("- 목록")] }));
    expect(html).toContain("- 목록");
    expect(html).not.toContain("<ul>");
  });

  it("'> 인용'·'! 제목'·'# 헤딩' 문단이 블록 구조로 바뀌지 않는다", () => {
    const html = markdownToHtml(
      jsonToMarkdown({
        type: "doc",
        content: [para("> 인용입니다"), para("! 제목입니다"), para("# 헤딩입니다")],
      }),
    );
    expect(html).toContain("&gt; 인용입니다");
    expect(html).not.toContain("<blockquote>");
    expect(html).toContain("! 제목입니다");
    expect(html).not.toContain("data-title");
    expect(html).toContain("# 헤딩입니다");
    expect(html).not.toMatch(/<h[1-6]>/);
  });

  it("hardBreak 다음 줄 시작 토큰도 보호된다", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "첫째 줄" },
            { type: "hardBreak" },
            { type: "text", text: "1. 둘째 줄" },
          ],
        },
      ],
    };
    const html = markdownToHtml(jsonToMarkdown(doc));
    expect(html).toContain("1. 둘째 줄");
    expect(html).not.toContain("<ol>");
  });
});

describe("content_md 미러 round-trip — PUA 센티널 충돌", () => {
  it("사용자 텍스트의 진짜 PUA 문자(E100)가 커스텀 기호([)로 오변환되지 않는다", () => {
    const html = markdownToHtml(
      jsonToMarkdown({ type: "doc", content: [para("텍스트\uE100 끝")] }),
    );
    expect(html.includes("\uE100") || html.toLowerCase().includes("&#xe100;")).toBe(true);
    expect(html).not.toContain("[");
  });
});

describe("content_md 미러 round-trip — 구분자 경계·주석 파트(P3)", () => {
  it("텍스트가 '=' 로 끝나는 형광펜 — 색 매크로가 리터럴로 새지 않는다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [para("값=", [{ type: "highlight", attrs: { color: "#fef08a" } }])],
    });
    const html = markdownToHtml(md);
    expect(html).toContain("<mark");
    expect(html).toContain("값=");
    expect(html).not.toContain("{#fef08a}");
  });

  it("텍스트가 ']' 로 끝나는 핵심요약 — 닫는 괄호가 새지 않는다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [para("요약]", [{ type: "coreSummary" }])],
    });
    const html = markdownToHtml(md);
    expect(html).toContain("data-core-summary");
    expect(html).toContain("요약]");
  });

  it("주석에 |·}·백슬래시가 포함돼도 문법이 깨지지 않는다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("본문", [
          { type: "annotation", attrs: { "data-annotation": "a|b}c\\d" } },
        ]),
      ],
    });
    const html = markdownToHtml(md);
    expect(html).toContain('data-annotation="a|b}c\\d"');
  });

  it("본문에 | 가 포함된 꼬마글씨도 올바르게 분할된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        para("a|b", [{ type: "annotation", attrs: { "data-annotation": "주석" } }]),
      ],
    });
    const html = markdownToHtml(md);
    expect(html).toContain('data-annotation="주석"');
    expect(html).toContain("a|b");
  });

  it("사용자 %%BR%% 리터럴이 <br> 로 바뀌지 않는다", () => {
    const html = markdownToHtml(jsonToMarkdown({ type: "doc", content: [para("비밀 %%BR%% 토큰")] }));
    // 노드 환경은 DOMParser 가 없어 엔티티 형태로 남는다 — 둘 다 리터럴 보존으로 간주.
    expect(html.includes("%%BR%%") || html.includes("&#37;&#37;BR&#37;&#37;")).toBe(true);
    expect(html).not.toContain("<br>");
  });

  it("표 셀 안 이미지도 미러에 포함된다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "image",
                          attrs: { src: "/api/images/cell-img", alt: "셀그림" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(md).toContain("![셀그림](/api/images/cell-img)");
    const html = markdownToHtml(md);
    expect(html).toContain("<img");
  });

  it("src 의 괄호·공백이 퍼센트 인코딩돼 링크 문법이 깨지지 않는다", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://ex.com/a b(1).png", alt: "x" } },
      ],
    });
    expect(md).toContain("(https://ex.com/a%20b%281%29.png)");
    const html = markdownToHtml(md);
    expect(html).toContain('src="https://ex.com/a%20b%281%29.png"');
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
