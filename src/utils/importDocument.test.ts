// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// 업로드 API 모킹 — 네트워크 없이 data: URI 교체 로직만 검증.
const uploadImageMock = vi.hoisted(() => vi.fn());
vi.mock("@/api/uploads", () => ({
  uploadImage: uploadImageMock,
}));

import {
  detectImportKind,
  importMarkdownFile,
  uploadInlineDataImages,
} from "./importDocument";
import type { JSONContent } from "@shared/runs";

function fakeFile(name: string, text: string): File {
  return new File([text], name, { type: "text/markdown" });
}

describe("detectImportKind", () => {
  it("확장자 판별 — md/markdown/txt → markdown, docx → docx, 그 외 null", () => {
    expect(detectImportKind({ name: "a.md" })).toBe("markdown");
    expect(detectImportKind({ name: "b.markdown" })).toBe("markdown");
    expect(detectImportKind({ name: "c.TXT" })).toBe("markdown"); // 대소문자 무시
    expect(detectImportKind({ name: "d.docx" })).toBe("docx");
    expect(detectImportKind({ name: "e.png" })).toBeNull();
    expect(detectImportKind({ name: "f.doc" })).toBeNull(); // 구 .doc 미지원
  });
});

describe("importMarkdownFile — md → TipTap JSON", () => {
  it("헤딩/본문/사내 마크(박스·형광펜)가 스키마로 해석된다", async () => {
    const json = await importMarkdownFile(
      fakeFile(
        "test.md",
        "# 제목\n\n본문 ++박스입니다++ 그리고 ==형광== 부분.\n",
      ),
    );

    expect(json.type).toBe("doc");
    const blocks = json.content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);

    // 마크는 JSON 의 marks 로 — 실제 저장 포맷과 동일 경로.
    const serialized = JSON.stringify(json);
    expect(serialized).toContain("boxBorder");
    expect(serialized).toContain("highlight");
    expect(serialized).toContain("박스입니다");
  });

  it("사내 내보내기 왕복 문법(! 제목, {{본문|주석}})도 복원된다", async () => {
    const json = await importMarkdownFile(
      fakeFile("rt.md", "! 보고서 제목\n\n{{용어|부연 설명}} 설명 문단.\n"),
    );
    const serialized = JSON.stringify(json);
    expect(serialized).toContain("title"); // ! → title 노드
    expect(serialized).toContain("annotation"); // {{|}} → annotation 마크
  });
});

describe("uploadInlineDataImages — data: URI → R2 업로드", () => {
  beforeEach(() => {
    uploadImageMock.mockReset();
  });

  const IMG_OK = "data:image/png;base64,aVpURUhV";
  const IMG_FAIL = "data:image/png;base64,ZkFJTFVV";
  const docWith = (...srcs: string[]): JSONContent => ({
    type: "doc",
    content: srcs.map((src) => ({ type: "image", attrs: { src, alt: null } })),
  });

  it("data: 이미지를 업로드 URL 로 교체하고 원격/상대 src 는 건드리지 않는다", async () => {
    uploadImageMock.mockResolvedValue({ id: "u1", url: "/api/images/u1", width: 1, height: 1 });
    const { json, stats } = await uploadInlineDataImages({
      type: "doc",
      content: [
        { type: "image", attrs: { src: IMG_OK } },
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
      ],
    });

    expect(stats).toEqual({ uploaded: 1, failed: 0 });
    expect(json.content?.[0]?.attrs?.src).toBe("/api/images/u1");
    expect(json.content?.[1]?.type).toBe("paragraph"); // 비이미지 노드 보존
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
  });

  it("업로드 실패 이미지는 노드에서 제외(failed 카운트)", async () => {
    uploadImageMock.mockRejectedValue(new Error("boom"));
    const { json, stats } = await uploadInlineDataImages(docWith(IMG_FAIL));

    expect(stats).toEqual({ uploaded: 0, failed: 1 });
    expect(json.content).toHaveLength(0); // 제거됨 — 깨진 src 영속화 방지
  });

  it("동일 data: URI 는 1회만 업로드(캐시)", async () => {
    uploadImageMock.mockResolvedValue({ id: "u1", url: "/api/images/u1", width: 1, height: 1 });
    const { stats } = await uploadInlineDataImages(docWith(IMG_OK, IMG_OK));

    expect(stats.uploaded).toBe(2);
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
  });

  it("http(s) src 는 업로드하지 않고 그대로 둔다", async () => {
    const { json, stats } = await uploadInlineDataImages(
      docWith("/api/images/already", "https://example.com/x.png"),
    );
    expect(stats.uploaded).toBe(0);
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(json.content?.[0]?.attrs?.src).toBe("/api/images/already");
  });
});
