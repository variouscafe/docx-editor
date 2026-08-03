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

/** 인라인 노드 → 마크다운 문자열(hardBreak → 줄바꿈, marks → 커스텀 문법 감싸기). */
function renderInline(nodes: JSONContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      // 헤딩 prefix(공백+기호)는 content_md 에서 제외 — 깨끗한 `# 본문` 미러.
      if ((node.marks ?? []).some((m) => m.type === "headingPrefix")) continue;
      out += wrapMarks(node.text ?? "", node.marks ?? []);
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
