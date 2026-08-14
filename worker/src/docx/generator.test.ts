import { describe, it, expect } from "vitest";
import { generateDocx } from "./generator.js";
import { defaultOptions, normalizeOptions } from "@shared/options";

/**
 * DOCX 생성기 회귀 테스트 — 미리보기 ↔ DOCX 패리티에서 실제로 발생했던 결함 방지.
 * Blob(zip)에서 word/document.xml 을 추출해 핵심 포맷이 반영됐는지 검사한다.
 */

/** ZIP 로컬 파일 헤더 파싱 → 지정 엔트리 텍스트 추출(deflate-raw 해제). */
async function readZipEntryText(buf: ArrayBuffer, name: string): Promise<string> {
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder();
  const nameBytes = new TextEncoder().encode(name);

  // 로컬 파일 헤더 시그니처 0x04034b50 탐색(파일명 일치).
  outer: for (let i = 0; i + 30 < bytes.length; i++) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04)
      continue;
    const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const extraLen = bytes[i + 28] | (bytes[i + 29] << 8);
    const n = bytes.subarray(i + 30, i + 30 + nameLen);
    if (n.length !== nameBytes.length) continue;
    for (let j = 0; j < n.length; j++) if (n[j] !== nameBytes[j]) continue outer;
    const method = bytes[i + 8] | (bytes[i + 9] << 8);
    const compSize =
      bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    const data = bytes.subarray(i + 30 + nameLen + extraLen, i + 30 + nameLen + extraLen + compSize);
    if (method === 0) return decoder.decode(data); // store
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  }
  throw new Error(`zip entry not found: ${name}`);
}

async function documentXml(content: object, options: unknown = defaultOptions): Promise<string> {
  const blob = await generateDocx(content as never, options as never);
  return readZipEntryText(await blob.arrayBuffer(), "word/document.xml");
}

const text = (t: string, marks?: object[]) => ({
  type: "text",
  text: t,
  ...(marks ? { marks } : {}),
});

describe("generateDocx — 포맷 패리티", () => {
  it("일반 문단의 fontSize mark 가 half-point 로 반영된다", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("보통 "), text("큰글씨", [{ type: "fontSize", attrs: { fontSize: 18 } }])],
        },
      ],
    });
    expect(xml).toContain("보통");
    expect(xml).toMatch(/<w:sz w:val="36".{0,400}?큰글씨/); // 18pt = 36 half-point(rPr 가 텍스트 앞)
  });

  it("핵심요약 내 hardBreak 가 개행으로 유지된다", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "계약 효력", marks: [{ type: "coreSummary" }] },
            { type: "hardBreak" },
            { type: "text", text: "두 번째 줄", marks: [{ type: "coreSummary" }] },
          ],
        },
      ],
    });
    expect(xml).toContain("계약 효력");
    expect(xml).toContain("두 번째 줄");
    // break 가 사라지면 두 텍스트가 한 run 으로 합쳐진다 — 별도 문단으로 분리돼 있어야 함.
    const joined = xml.replace(/\s+/g, "");
    expect(joined).not.toMatch(/계약효력두번째줄/);
  });

  it("꼬마글씨 mode1 — TextBox(frame) 로 주석이 export 된다", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            text("Claude Code", [{ type: "annotation", attrs: { "data-annotation": "코딩 툴" } }]),
            text(" 사용법"),
          ],
        },
      ],
    });
    expect(xml).toContain("코딩 툴");
    expect(xml).toContain("<w:framePr"); // TextBox ≈ frame properties
  });

  it("꼬마글씨 mode2 — ○ 별도 문단으로 export 된다", async () => {
    const xml = await documentXml(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [text("본문", [{ type: "annotation", attrs: { "data-annotation": "부연" } }])],
          },
        ],
      },
      normalizeOptions({ annotationMode: 2 }),
    );
    expect(xml).toContain("○ 부연");
  });

  it("헤딩의 꼬마글씨가 주석으로 export 된다(드롭 방지)", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [text("개요", [{ type: "annotation", attrs: { "data-annotation": "헤딩 주석" } }])],
        },
      ],
    });
    expect(xml).toContain("개요");
    expect(xml).toContain("헤딩 주석");
  });

  it("제목 정렬이 options.title.align 을 따른다(좌측)", async () => {
    const xml = await documentXml(
      {
        type: "doc",
        content: [{ type: "title", content: [text("제목")] }],
      },
      normalizeOptions({ title: { align: "left" } }),
    );
    expect(xml).toMatch(/<w:jc w:val="left"/);
  });

  it("제목 인라인 굵게 mark 가 옵션과 무관하게 유지된다", async () => {
    // 옵션 title.bold=false 여도 run mark 굵게는 살아야 한다.
    const xml = await documentXml(
      {
        type: "doc",
        content: [
          { type: "title", content: [text("보통 "), text("강조", [{ type: "bold" }])] },
        ],
      },
      normalizeOptions({ title: { bold: false } }),
    );
    expect(xml).toMatch(/<w:b\/>.{0,200}?강조/);
  });

  it("한 문단의 mode1 복수 주석이 y 오프셋로 분리된다(겹침 방지)", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            text("A", [{ type: "annotation", attrs: { "data-annotation": "첫 주석" } }]),
            text("B", [{ type: "annotation", attrs: { "data-annotation": "둘째 주석" } }]),
          ],
        },
      ],
    });
    expect(xml).toContain("첫 주석");
    expect(xml).toContain("둘째 주석");
    // 두 번째 주석은 한 줄(240twips) 아래 — 같은 y 로 겹치지 않는다.
    expect(xml).toMatch(/w:y="180"/);
    expect(xml).toMatch(/w:y="420"/);
  });

  it("박스 보더가 미리보기 굵기(1.125pt=sz 9)로 export 된다", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("박스", [{ type: "boxBorder", attrs: { "data-border": "solid" } }])],
        },
      ],
    });
    expect(xml).toMatch(/<w:top w:val="single" w:color="333333" w:sz="9" w:space="8"/);
  });

  it("표 rowspan 이 vMerge 로 매핑된다", async () => {
    const xml = await documentXml({
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
                  attrs: { rowspan: 2, colwidth: [100] },
                  content: [{ type: "paragraph", content: [text("병합")] }],
                },
                {
                  type: "tableCell",
                  attrs: { colwidth: [100] },
                  content: [{ type: "paragraph", content: [text("A")] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colwidth: [100] },
                  content: [{ type: "paragraph", content: [text("B")] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(xml).toContain('<w:vMerge w:val="restart"');
  });

  it("형광펜 색상이 셰이딩으로 반영된다", async () => {
    const xml = await documentXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("강조", [{ type: "highlight", attrs: { color: "#fef08a" } }])],
        },
      ],
    });
    expect(xml).toMatch(/w:fill="FEF08A"/);
  });

  it("옵션 마진(cm)이 twips 로 반영된다", async () => {
    const xml = await documentXml(
      { type: "doc", content: [] },
      normalizeOptions({ common: { marginTop: 2, marginBottom: 2, marginLeft: 2, marginRight: 2 } }),
    );
    expect(xml).toMatch(/w:top="1133"/); // 2cm = 1133.86 → 1133 twips(절사)
  });

  it("빈 문서·빈 옵션도 크래시 없이 생성된다", async () => {
    const blob = await generateDocx({ type: "doc", content: [] }, {} as never);
    expect(blob.size).toBeGreaterThan(0);
  });
});
