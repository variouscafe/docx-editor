import type { Editor } from "@tiptap/react";
import type { Node as PmNode } from "@tiptap/pm/model";

/**
 * 표 수준 동작 — 복사(클립보드)·복제(인라인) 보조. 삭제는 표 확장의 deleteTable 사용.
 * 현재 셀렉션이 속한 표를 대상으로 한다.
 */

function findTable(state: any): { node: PmNode; pos: number } | null {
  let res: { node: PmNode; pos: number } | null = null;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node: PmNode, pos: number) => {
    if (node.type.name === "table" && !res) {
      res = { node, pos };
      return false;
    }
    return true;
  });
  return res;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 표 노드 → HTML 문자열(단순 <table>/<tr>/<td> + 정렬). 클립보드 복사/외부 붙여넣기용. */
function tableNodeToHtml(table: PmNode): string {
  let html = "<table>";
  table.forEach((row) => {
    html += "<tr>";
    row.forEach((cell) => {
      const tag = cell.type.name === "tableHeader" ? "th" : "td";
      const align = (cell.firstChild as PmNode | null)?.attrs?.textAlign as string | undefined;
      const style = align ? ` style="text-align:${align}"` : "";
      html += `<${tag}${style}>${escapeHtml(cell.textContent)}</${tag}>`;
    });
    html += "</tr>";
  });
  return `${html}</table>`;
}

/** 표를 바로 아래에 복제(같은 내용의 새 표 + 빈 문단 삽입). 레이아웃 재사용에 편리. */
export function duplicateTable(editor: Editor): void {
  const state = editor.state;
  const t = findTable(state);
  if (!t) return;
  const copy = state.schema.nodeFromJSON(t.node.toJSON());
  const emptyPara = state.schema.nodes.paragraph.create();
  // 원본 표 바로 뒤에 복제본 + 빈 문단(두 표 사이 커서/편집 여유).
  const tr = state.tr.insert(t.pos + t.node.nodeSize, [copy, emptyPara]);
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** 표를 클립보드로 복사(HTML + 텍스트). 같은 에디터·Word 등 어디든 붙여넣기 가능. */
export async function copyTableToClipboard(editor: Editor): Promise<boolean> {
  const t = findTable(editor.state);
  if (!t) return false;

  const html = tableNodeToHtml(t.node);
  const text = t.node.textContent;
  const clip = (navigator as any).clipboard;

  try {
    if (clip && typeof ClipboardItem !== "undefined") {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await clip.write([item]);
      return true;
    }
  } catch {
    /* 폴백 */
  }
  try {
    await clip?.writeText(text);
    return true;
  } catch {
    return false;
  }
}
