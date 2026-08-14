import { Mark, Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { Fragment, type Node as PmNode, type MarkType } from "@tiptap/pm/model";
import type { DocxOptions } from "@shared/options";
import { isContentBracket, LineStartSymbol } from "@shared/lineStartSymbol";
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
 * 모든 헤딩의 prefix를 options 기반으로 재구축(마이그레이션·재적용·재번호화 공용).
 * - 비브래킷: [공백+기호(marked)] + 본문
 * - 브래킷(【】): 【(marked) + 본문 + 】(marked)
 * 역순 replaceWith 로 위치 보존. 본문 marks/hardBreak 보존.
 * 이미 원하는 내용인 헤딩은 Fragment.eq 로 건너뛴다(변경 없으면 null → 재적용 루프 방지).
 */
export function ensureHeadingPrefixes(editor: Editor, options: DocxOptions): void {
  const tr = rebuildHeadingPrefixTransaction(editor.state, options);
  if (tr) editor.view.dispatch(tr);
}

/** 재구축 트랜잭션 계산 — 변경이 필요한 헤딩이 없으면 null. */
function rebuildHeadingPrefixTransaction(
  state: EditorState,
  options: DocxOptions,
): Transaction | null {
  const markType = state.schema.marks.headingPrefix;
  if (!markType) return null;
  const counters = createCounters();

  const targets: { pos: number; node: PmNode; level: number; count: number }[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    const level = (node.attrs.level ?? 1) as number;
    counters[`h${level}` as HeadingKey]++;
    targets.push({ pos: offset, node, level, count: counters[`h${level}` as HeadingKey] });
  });

  if (!targets.length) return null;

  // 역순 처리(높은 pos 먼저) → 앞선 헤딩 위치 보존.
  let tr: Transaction | null = null;
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
    } else if (symbol === LineStartSymbol.NONE) {
      // 기호 없음 — prefix 없이 본문만 (기존 prefix는 extractBody 로 이미 제거됨).
      nodes = body;
    } else {
      const effLeading = getEffectiveLeadingSpaces(symbol, configured);
      const { prefixText } = buildHeadingPrefix(symbol, effLeading, h.count);
      nodes = [schema.text(prefixText, [markType.create()]), ...body];
    }
    // 이미 원하는 내용이면 건너뛰기 — 재번호화 시 변경된 헤딩만 교체.
    if (h.node.content.eq(Fragment.fromArray(nodes))) continue;
    if (!tr) tr = state.tr;
    tr.replaceWith(start, end, Fragment.from(nodes));
  }

  if (tr) tr.setMeta("addToHistory", false);
  return tr;
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
 * 헤딩 prefix 동기화 순수 로직(플러그인 외부에서 단위 테스트 가능).
 *
 * 헤딩 "구조"(개수·시작 위치·레벨)가 변한 트랜잭션에서만 전체 prefix를 재구축한다.
 * - 새 헤딩 생성(빈 헤딩 포함) → prefix 부여
 * - 헤딩 삽입/삭제/순서 변경 → 이후 헤딩 카운터 재번호화
 * - 문단→헤딩 변환(내용 있는 경우 포함) → prefix 부여
 * 본문만 편집한 트랜잭션(구조 불변)은 건드리지 않는다 — 사용자가 prefix를 지운 경우
 * 재삽입하지 않음(삭제 루프 방지, 기존 방침 유지).
 */
export function syncHeadingPrefixes(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
  options: DocxOptions,
): Transaction | null {
  if (!transactions.some((t) => t.docChanged)) return null;
  const markType = newState.schema.marks.headingPrefix;
  if (!markType) return null;

  // oldState 헤딩(시작 위치+레벨)을 newState 좌표로 매핑해 비교.
  const mapping = new Mapping();
  for (const t of transactions) mapping.appendMapping(t.mapping);
  const oldHeads: { pos: number; level: number }[] = [];
  oldState.doc.forEach((node, offset) => {
    if (node.type.name === "heading") {
      oldHeads.push({ pos: mapping.map(offset), level: (node.attrs.level ?? 1) as number });
    }
  });
  const newHeads: { pos: number; level: number }[] = [];
  newState.doc.forEach((node, offset) => {
    if (node.type.name === "heading") {
      newHeads.push({ pos: offset, level: (node.attrs.level ?? 1) as number });
    }
  });

  // 구조 불변(본문 편집만) → 재구축 없음.
  const structuralChange =
    oldHeads.length !== newHeads.length ||
    oldHeads.some((h, i) => h.pos !== newHeads[i].pos || h.level !== newHeads[i].level);
  if (!structuralChange) return null;

  return rebuildHeadingPrefixTransaction(newState, options);
}

/**
 * 헤딩 구조 동기화 — 헤딩 생성/삭제/변환 시 prefix 재구축(재번호화 포함).
 * 본문 수정만 있는 트랜잭션엔 개입하지 않음(사용자가 prefix를 지운 경우 재삽입 안 함 — 삭제 루프 방지).
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
        appendTransaction: (transactions, oldState, newState) =>
          syncHeadingPrefixes(transactions, oldState, newState, getOptions()),
      }),
    ];
  },
});
