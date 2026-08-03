import { Mark, Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, type Node as PmNode, type MarkType } from "@tiptap/pm/model";
import type { DocxOptions } from "@shared/options";
import { isContentBracket } from "@shared/lineStartSymbol";
import {
  buildHeadingPrefix,
  createCounters,
  getEffectiveLeadingSpaces,
  type HeadingKey,
} from "@shared/symbols";

/**
 * 헤딩 prefix(선행 공백 + 시작 기호) 식별 마크.
 * prefix 텍스트에 부여 → 마이그레이션/재적용 식별 + 공백 보존(white-space: pre).
 * getJSON() 에 포함되어 저장됨(비영속 데코레이션 설계에서 실제 텍스트로 전환).
 */
export const HeadingPrefix = Mark.create({
  name: "headingPrefix",
  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-heading-prefix]" }];
  },

  renderHTML() {
    return ["span", { "data-heading-prefix": "", style: "white-space: pre" }, 0];
  },
});

const isMarkedText = (node: PmNode, markType: MarkType): boolean =>
  node.isText && node.marks.some((m) => m.type === markType);

/** 헤딩에서 기존 prefix(marked)를 제거한 본문 노드 추출. */
function extractBody(node: PmNode, bracket: boolean, markType: MarkType): PmNode[] {
  const children: PmNode[] = [];
  node.forEach((child) => children.push(child));
  let start = 0;
  while (start < children.length && isMarkedText(children[start], markType)) start++;
  if (bracket) {
    let end = children.length;
    while (end > start && isMarkedText(children[end - 1], markType)) end--;
    return children.slice(start, end);
  }
  return children.slice(start);
}

/**
 * 모든 헤딩의 prefix를 options 기반으로 재구축(마이그레이션·재적용 공용).
 * - 비브래킷: [공백+기호(marked)] + 본문
 * - 브래킷(【】): 【(marked) + 본문 + 】(marked)
 * 역순 replaceWith 로 위치 보존. 본문 marks/hardBreak 보존.
 */
export function ensureHeadingPrefixes(editor: Editor, options: DocxOptions): void {
  const state = editor.state;
  const markType = state.schema.marks.headingPrefix;
  if (!markType) return;
  const tr = state.tr;
  const counters = createCounters();

  const targets: { pos: number; node: PmNode; level: number; count: number }[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    const level = (node.attrs.level ?? 1) as number;
    counters[`h${level}` as HeadingKey]++;
    targets.push({ pos: offset, node, level, count: counters[`h${level}` as HeadingKey] });
  });

  if (!targets.length) return;

  // 역순 처리(높은 pos 먼저) → 앞선 헤딩 위치 보존.
  let modified = false;
  for (const h of targets.reverse()) {
    const key = `h${h.level}` as HeadingKey;
    const symbol = options[key].lineStartSymbol;
    const configured = options[key].leadingSpaces ?? 0;
    const bracket = isContentBracket(symbol);
    const schema = h.node.type.schema;
    const start = h.pos + 1;
    const end = h.pos + h.node.nodeSize - 1;

    const body = extractBody(h.node, bracket, markType);
    let nodes: PmNode[];
    if (bracket) {
      nodes = [
        schema.text("【", [markType.create()]),
        ...body,
        schema.text("】", [markType.create()]),
      ];
    } else {
      const effLeading = getEffectiveLeadingSpaces(symbol, configured);
      const { prefixText } = buildHeadingPrefix(symbol, effLeading, h.count);
      nodes = [schema.text(prefixText, [markType.create()]), ...body];
    }
    tr.replaceWith(start, end, Fragment.from(nodes));
    modified = true;
  }

  if (modified) {
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }
}

/** 문서에 headingPrefix mark가 하나라도 있는지(구 포맷 판별). */
export function hasAnyHeadingPrefixMark(doc: PmNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "headingPrefix")) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * 헤딩 생성 동기화 — 새로 생성된 빈 헤딩에 prefix 삽입.
 * 내용이 비어있고 mark 없는 헤딩만 건드림(생성 시점). 본문 수정 중엔 재삽입 안 함.
 */
export const HeadingPrefixSync = Extension.create<{ getOptions: () => DocxOptions }>({
  name: "headingPrefixSync",

  addOptions() {
    return { getOptions: () => ({}) as DocxOptions };
  },

  addProseMirrorPlugins() {
    const getOptions = this.options.getOptions;
    return [
      new Plugin({
        key: new PluginKey("headingPrefixSync"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const options = getOptions();
          const markType = newState.schema.marks.headingPrefix;
          if (!markType) return null;

          const counters = createCounters();
          const targets: { pos: number; level: number; count: number }[] = [];
          newState.doc.forEach((node, offset) => {
            if (node.type.name !== "heading") return;
            const level = (node.attrs.level ?? 1) as number;
            counters[`h${level}` as HeadingKey]++;
            // 빈 헤딩(방금 생성) + prefix 없음 → 삽입 대상.
            if (node.content.size === 0) {
              targets.push({ pos: offset, level, count: counters[`h${level}` as HeadingKey] });
            }
          });

          if (!targets.length) return null;

          const tr = newState.tr;
          const schema = newState.schema;
          for (const t of targets.reverse()) {
            const key = `h${t.level}` as HeadingKey;
            const symbol = options[key].lineStartSymbol;
            const configured = options[key].leadingSpaces ?? 0;
            const at = t.pos + 1;
            if (isContentBracket(symbol)) {
              tr.insert(at, Fragment.from([schema.text("【", [markType.create()]), schema.text("】", [markType.create()])]));
            } else {
              const effLeading = getEffectiveLeadingSpaces(symbol, configured);
              const { prefixText } = buildHeadingPrefix(symbol, effLeading, t.count);
              tr.insert(at, schema.text(prefixText, [markType.create()]));
            }
          }
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});
