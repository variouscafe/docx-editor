/**
 * 문서 가져오기 — 외부 파일(.md/.txt/.docx) → TipTap JSON(정규 포맷) 변환 파이프라인.
 *  - .md/.markdown/.txt: markdownToHtml(커스텀 marked — 박스/형광펜/꼬마글씨 등 사내 문법 포함)
 *    → generateJSON. content_md 내보내기 왕복(round-trip)도 이 경로로 열린다.
 *  - .docx: mammoth(브라우저 번들, lazy import)로 HTML 변환 → generateJSON.
 *    표·헤딩·굵게/이탤릭/밑줄·이미지(data URI) 지원. 복잡한 서식은 사내 스키마로 평탄화.
 * 파싱은 @tiptap/html(generateJSON) — 뷰/장식 없이 extensions 스키마만 사용하므로
 * 마운트되지 않은 환경에서도 안전하다(에디터 인스턴스·DOM 측정 플러그인 무관).
 */
import { generateJSON } from "@tiptap/html";
import { defaultOptions } from "@shared/options";
import type { JSONContent } from "@shared/runs";
import { markdownToHtml } from "./markdownToHtml";
import {
  createPreviewExtensions,
  A4_HEIGHT,
  A4_WIDTH,
} from "@/components/Preview/createPreviewExtensions";
import { uploadImage } from "@/api/uploads";

/** 파싱 전용 extensions 싱글턴 — 스키마 생성에만 필요(getOptions 결과는 파싱에 무관). */
let cachedExtensions: ReturnType<typeof createPreviewExtensions>["extensions"] | null = null;
function getParseExtensions() {
  cachedExtensions ??= createPreviewExtensions({
    getOptions: () => defaultOptions,
    pageHeight: A4_HEIGHT,
    pageWidth: A4_WIDTH,
  }).extensions;
  return cachedExtensions;
}

/** HTML 문자열 → TipTap JSON. markdownPaste insertContent 와 동일 스키마로 해석. */
export function htmlToDocJson(html: string): JSONContent {
  return generateJSON(html, getParseExtensions());
}

export type ImportKind = "markdown" | "docx";

/** 확장자로 가져오기 종류 판별 — 미지원이면 null. */
export function detectImportKind(file: { name: string }): ImportKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")) {
    return "markdown";
  }
  return null;
}

/** 마크다운 파일 → TipTap JSON. */
export async function importMarkdownFile(file: File): Promise<JSONContent> {
  const md = await file.text();
  return htmlToDocJson(markdownToHtml(md));
}

/** DOCX 파일 → TipTap JSON(mammoth lazy import — 첫 import 시에만 청크 로드). */
export async function importDocxFile(file: File): Promise<JSONContent> {
  const mod = await import("mammoth/mammoth.browser.js");
  // UMD 번들 — 번들러 interop 에 따라 default 또는 namespace 에 객체가 걸린다.
  const mammoth = mod.default ?? mod;
  const arrayBuffer = await file.arrayBuffer();
  // 밑줄/취소선 명시 매핑(기본 맵 버전 따라 누락 방지) — 나머지는 mammoth 기본값.
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer },
    { styleMap: ["u => u", "strike => s"] },
  );
  return htmlToDocJson(html);
}

/** 파일 → TipTap JSON(확장자 자동 판별). 미지원 확장자는 throw. */
export async function importFile(file: File): Promise<JSONContent> {
  const kind = detectImportKind(file);
  if (!kind) throw new Error("Unsupported file type");
  return kind === "docx" ? importDocxFile(file) : importMarkdownFile(file);
}

/* ── data: URI 이미지 → R2 업로드 ────────────────────────────────── */

export interface ImportImageStats {
  uploaded: number;
  failed: number;
}

/** 이미지 blob 치수 측정(비트맵 디코딩 실패 환경에선 null — 서버가 스니프로 보완). */
async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return null;
  }
}

/**
 * JSON 트리의 data: URI 이미지(.docx 가져오기 시 mammoth가 base64로 인라인)를
 * R2 업로드로 교체 — data URI 가 정규 JSON 에 영속화되면 D1 행 크기 폭발 +
 * 도메인 독립성(/api/images/{id} 상대 경로 규약)이 깨진다.
 * 업로드 실패 이미지는 노드 제거(깨진 src 영속화 방지). 동일 data URI 는 캐시로 1회 업로드.
 */
export async function uploadInlineDataImages(json: JSONContent): Promise<{
  json: JSONContent;
  stats: ImportImageStats;
}> {
  const stats: ImportImageStats = { uploaded: 0, failed: 0 };
  const urlCache = new Map<string, string | null>();

  async function resolveSrc(dataUri: string): Promise<string | null> {
    if (urlCache.has(dataUri)) return urlCache.get(dataUri) ?? null;
    let url: string | null = null;
    try {
      const res = await fetch(dataUri);
      const blob = await res.blob();
      const dims = await imageSize(blob);
      const up = await uploadImage(blob, dims?.width ?? undefined, dims?.height ?? undefined);
      url = up.url;
    } catch {
      url = null; // 디코딩/업로드 실패 — 이미지 제외
    }
    urlCache.set(dataUri, url);
    return url;
  }

  async function walk(node: JSONContent): Promise<JSONContent> {
    if (!node.content?.length) return node;
    let changed = false;
    const out: JSONContent[] = [];
    for (const child of node.content) {
      const src = child.type === "image" ? String(child.attrs?.src ?? "") : "";
      if (src.startsWith("data:")) {
        const url = await resolveSrc(src);
        changed = true;
        if (url) {
          stats.uploaded += 1;
          out.push({ ...child, attrs: { ...child.attrs, src: url } });
        } else {
          stats.failed += 1; // 노드 제거
        }
        continue;
      }
      const walked = await walk(child);
      if (walked !== child) changed = true;
      out.push(walked);
    }
    return changed ? { ...node, content: out } : node;
  }

  return { json: await walk(json), stats };
}
