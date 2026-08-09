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

/** 표 노드 → HTML 문자열(<table><tbody><tr><td> + 정렬). 클립보드 복사/외부 붙여넣기용. */
function tableNodeToHtml(table: PmNode): string {
  let body = "";
  table.forEach((row) => {
    body += "<tr>";
    row.forEach((cell) => {
      const tag = cell.type.name === "tableHeader" ? "th" : "td";
      const align = (cell.firstChild as PmNode | null)?.attrs?.textAlign as string | undefined;
      const style = align ? ` style="text-align:${align}"` : "";
      body += `<${tag}${style}>${escapeHtml(cell.textContent)}</${tag}>`;
    });
    body += "</tr>";
  });
  return `<table><tbody>${body}</tbody></table>`;
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

/**
 * 동기식 execCommand 기반 HTML 클립보드 복사.
 * 모바일 Safari 는 비동기 clipboard API(navigator.clipboard.write)에서 text/html 을
 * 지원하지 않아 표 구조가 평문으로 떨어지는 문제를 회피 — contenteditable 선택 복사는
 * text/html 을 그대로 클립보드에 넣는다(레거시지만 모바일에서 가장 확실).
 */
function copyRichHtml(html: string): boolean {
  const doc = document;
  const el = doc.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.setAttribute("aria-hidden", "true");
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "-9999px";
  el.innerHTML = html;
  doc.body.appendChild(el);

  const sel = doc.getSelection();
  const saved: Range[] = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i).cloneRange());
  }
  const range = doc.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);

  let ok = false;
  try {
    ok = doc.execCommand("copy");
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  saved.forEach((r) => sel?.addRange(r));
  doc.body.removeChild(el);
  return ok;
}

/** 표를 클립보드로 복사(HTML + 텍스트). 같은 에디터·Word 등 어디든 붙여넣기 가능. */
export async function copyTableToClipboard(editor: Editor): Promise<boolean> {
  const t = findTable(editor.state);
  if (!t) return false;
  const html = tableNodeToHtml(t.node);
  const text = t.node.textContent;

  // 1) 동기식 execCommand(모바일에서 text/html 지원) — 클릭 제스처 내에서 즉시 실행.
  if (copyRichHtml(html)) return true;

  // 2) 비동기 클립보드 API 폴백(데스크톱 등 execCommand 거부 시).
  const clip = (navigator as any).clipboard;
  try {
    if (clip && typeof ClipboardItem !== "undefined") {
      await clip.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
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
