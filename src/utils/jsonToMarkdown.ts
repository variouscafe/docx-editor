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
          out.push(`![${alt}](${src})\n`);
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

/** 인라인 노드 → 마크다운 문자열(hardBreak → 줄바꿈, marks → 커스텀 문법 감싸기). */
function renderInline(nodes: JSONContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      const t = node.text ?? "";
      // 헤딩 prefix(공백+기호)는 content_md 에서 제외 — 깨끗한 `# 본문` 미러.
      if ((node.marks ?? []).some((m) => m.type === "headingPrefix")) continue;
      // 줄 시작 # 은 헤딩으로 오변환되므로 이스케이프.
      const escaped =
        /^#/.test(t) && (out === "" || out.endsWith("\n")) ? `\\${t}` : t;
      out += wrapMarks(escapeRaw(escaped), node.marks ?? []);
    } else if (node.type === "hardBreak") {
      out += "\n";
    } else if (node.content?.length) {
      out += renderInline(node.content);
    }
  }
  return out;
}

type Mark = { type: string; attrs?: Record<string, any> };

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
        result = `^^${result}^^`;
        break;
      case "highlight": {
        const color = m.attrs?.color as string | undefined;
        result = color ? `==${result}=={${color}}` : `==${result}==`;
        break;
      }
      case "boxBorder": {
        const b = m.attrs?.["data-border"];
        result = b === "dashed" ? `~~${result}~~` : `++${result}++`;
        break;
      }
      case "coreSummary":
        result = `[${result}]`;
        break;
      case "annotation":
        ann = m.attrs?.["data-annotation"] ?? "";
        break;
      case "fontSize":
        // 마크다운은 폰트크기 미표현 — 손실.
        break;
    }
  }
  return ann ? `{{${result}|${ann}}}` : result;
}
