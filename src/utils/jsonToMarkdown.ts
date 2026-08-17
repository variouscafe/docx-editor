import type { JSONContent } from "@shared/runs";

/**
 * TipTap JSON → 마크다운(best-effort 미러). content_md 컬럼용(검색/AI/이식).
 * JSON 이 정규 소스이므로 손실 허용 — fontSize, 표 등은 단순화.
 * markdownToHtml.ts 의 7개 커스텀 문법 역방향 매핑.
 */
export function jsonToMarkdown(doc: JSONContent): string {
  if (!doc) return "";
  return renderBlocks(doc.content ?? []).trim() + "\n";
}

function renderBlocks(nodes: JSONContent[]): string {
  const out: string[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "title":
        out.push(`! ${renderInline(node.content ?? [])}\n`);
        break;
      case "heading": {
        const level = node.attrs?.level ?? 1;
        out.push(`${"#".repeat(level)} ${renderInline(node.content ?? [])}\n`);
        break;
      }
      case "paragraph":
        out.push(`${renderInline(node.content ?? [])}\n`);
        break;
      case "bulletList":
        out.push(renderList(node.content ?? [], "-"));
        break;
      case "orderedList":
        out.push(renderList(node.content ?? [], "1."));
        break;
      case "table":
        out.push(renderTable(node));
        break;
      case "image": {
        // 블록 이미지 — ![설명](src). 캡션(설명)을 우선, 없으면 alt. escapeRaw 가 [] 를
        // 훼손하므로 인라인 경유 없이 직접 출력. 재반입 시 marked 가 alt → parseHTML 캡션 복원.
        const src = String(node.attrs?.src ?? "");
        if (src) {
          const caption = String(node.attrs?.caption ?? "").replace(/[[\]]/g, "");
          const alt = caption || String(node.attrs?.alt ?? "").replace(/[[\]]/g, "");
          out.push(`![${alt}](${escapeMdUrl(src)})\n`);
        }
        break;
      }
      case "hardBreak":
        break;
      default:
        if (node.content?.length) out.push(renderBlocks(node.content));
        break;
    }
  }
  return out.join("\n");
}

function renderList(items: JSONContent[], marker: string): string {
  return (
    items
      .map((item) =>
        (item.content ?? [])
          .map((child) => renderInline(child.content ?? []))
          .filter(Boolean)
          .map((line) => `${marker} ${line}`)
          .join("\n")
      )
      .join("\n") + "\n"
  );
}

function renderTable(node: JSONContent): string {
  const rows = (node.content ?? []).filter((r) => r.type === "tableRow");
  if (!rows.length) return "";
  const rendered = rows.map((row) =>
    (row.content ?? []).map((cell) => renderInline(cell.content ?? []).replace(/\|/g, "\\|") || " ").join(" | ")
  );
  const header = rendered[0];
  const sep = header
    .split(" | ")
    .map(() => "---")
    .join(" | ");
  return [header, sep, ...rendered.slice(1)].join("\n") + "\n";
}

/**
 * 원문 텍스트의 마크다운 메타문자 이스케이프 — 재반입 시 오변환 방지.
 * - 쌍자 기호(== ++ ~~ ^^)·{{·[...] 괄호쌍: 커스텀 문법과 충돌 → 백스케이프.
 *   (markdownToHtml 이 파싱 전 센티넬로 보호 — marked 확장은 백스케이시 무시함)
 * - *·줄 시작 #: 표준 마크다운 토큰 → 백스케이프(marked 기본 처리).
 */
function escapeRaw(text: string): string {
  return text
    .replace(/([=+~^])\1/g, "\\$1\\$1")
    .replace(/\{\{/g, "\\{\\{")
    .replace(/\[([^\]\n]*)\]/g, "\\[$1\\]")
    .replace(/\*/g, "\\*");
}

/**
 * 줄 시작 구조 토큰 이스케이프 — 문단 첫 텍스트가 마크다운 블록 문법으로 오변환되어
 * 블록 구조 자체가 바뀌는 것(리스트/제목/인용 하이재크)을 막는다.
 * marked 는 백슬래시 이스케이프를 텍스트로 복원하므로 내용은 불변(round-trip 보장).
 */
function escapeLineStart(text: string): string {
  return text
    .replace(/^(\d{1,9})([.)])(\s|$)/, "$1\\$2$3") // 1. / 1) → ordered list
    .replace(/^([-+*])(\s)/, "\\$1$2") // - + * → bullet
    .replace(/^>/, "\\>") // > → 인용
    .replace(/^!(\s)/, "\\!$1") // ! → 커스텀 제목
    .replace(/^(#{1,6})(\s)/, "\\$1$2"); // # → 헤딩
}

/** 인라인 노드 → 마크다운 문자열(hardBreak → 줄바꿈, marks → 커스텀 문법 감싸기). */
function renderInline(nodes: JSONContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      const t = node.text ?? "";
      // 헤딩 prefix(공백+기호)는 content_md 에서 제외 — 깨끗한 `# 본문` 미러.
      if ((node.marks ?? []).some((m) => m.type === "headingPrefix")) continue;
      // 줄 시작(블록 첫 텍스트 또는 hardBreak 직후)만 구조 토큰 이스케이프.
      const escaped =
        out === "" || out.endsWith("\n") ? escapeLineStart(t) : t;
      out += wrapMarks(escapeRaw(escaped), node.marks ?? []);
    } else if (node.type === "hardBreak") {
      out += "\n";
    } else if (node.type === "image") {
      // 인라인 위치(표 셀 단락 등)의 이미지 — renderBlocks 경로 외에도 미러에 포함.
      const src = String(node.attrs?.src ?? "");
      if (src) {
        const caption = String(node.attrs?.caption ?? node.attrs?.alt ?? "").replace(
          /[[\]]/g,
          "",
        );
        out += `![${caption}](${escapeMdUrl(src)})`;
      }
    } else if (node.content?.length) {
      out += renderInline(node.content);
    }
  }
  return out;
}

type Mark = { type: string; attrs?: Record<string, any> };

/**
 * 닫는 구분자 모호화 방지 — 감쌀 내용이 마커 문자로 끝나면 그 마지막 문자를 백슬래시
 * 이스케이프로 치환. `==x===`·`[요약]]` 처럼 닫는 구분자와 경계가 섞이던 것 방지
 * (재반입 시 센티널이 보호해 복원).
 */
function escapeTrailing(s: string, ch: string): string {
  return s.endsWith(ch) ? `${s.slice(0, -1)}\\${ch}` : s;
}

/**
 * 꼬마글씨 파트 이스케이프 — 몸통/주석의 |·}·백슬래시가 `{{body|ann}}` 문법을 깨지 않게.
 * 재반입: body 는 marked 표준 이스케이프·ann 은 주석 토크나이저 언이스케이프로 복원.
 */
function escapeAnnotationPart(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\}/g, "\\}");
}

/** 이미지 src 의 md 링크 파손 방지 — )·(·공백 퍼센트 인코딩(내부 uuid src 는 해당 없음). */
function escapeMdUrl(src: string): string {
  return src.replace(/[()\s]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function wrapMarks(text: string, marks: Mark[]): string {
  let result = text;
  let ann = "";
  // boxBorder / highlight / bold / italic / underline / coreSummary 적용.
  for (const m of marks) {
    switch (m.type) {
      case "bold":
        result = `**${result}**`;
        break;
      case "italic":
        result = `*${result}*`;
        break;
      case "underline":
        result = `^^${escapeTrailing(result, "^")}^^`;
        break;
      case "highlight": {
        const color = m.attrs?.color as string | undefined;
        const inner = escapeTrailing(result, "=");
        result = color ? `==${inner}=={${color}}` : `==${inner}==`;
        break;
      }
      case "boxBorder": {
        const b = m.attrs?.["data-border"];
        result =
          b === "dashed"
            ? `~~${escapeTrailing(result, "~")}~~`
            : `++${escapeTrailing(result, "+")}++`;
        break;
      }
      case "coreSummary":
        result = `[${escapeTrailing(result, "]")}]`;
        break;
      case "annotation":
        ann = m.attrs?.["data-annotation"] ?? "";
        break;
      case "fontSize":
        // 마크다운은 폰트크기 미표현 — 손실.
        break;
    }
  }
  return ann ? `{{${escapeAnnotationPart(result)}|${escapeAnnotationPart(ann)}}}` : result;
}
