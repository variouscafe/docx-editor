import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * 찾기/바꾸기 — 비영속 Decoration 기반(저장 JSON·DOCX 내보내기 영향 없음).
 *
 * 매칭 전략: 텍스트블록(문단·헤딩·셀) 단위로 인라인 텍스트를 연결한 뒤 검색하고,
 * 오프셋을 문서 위치로 역매핑한다. 이 에디터는 인라인 마크(굵게·박스·형광펜·꼬마글씨)
 * 경계에서 텍스트 노드가 쪼개지므로, "보고**서**입니다" 에서 "보고서" 를 찾으려면
 * 노드를 가로지르는 매칭이 필수다. 문단 경계는 워드와 동일하게 가로지르지 않는다.
 * hardBreak(Shift+Enter)는 연결 문자열에 \n 으로 삽입해 줄바꿈 가로지름 매칭을 차단한다.
 */

export interface FindMatchPart {
  from: number;
  to: number;
}

export interface FindMatch {
  /** 바꾸기용 전체 범위(세그먼트 결합). */
  from: number;
  to: number;
  /** 하이라이트 Decoration 용 세그먼트별 범위(마크 경계로 쪼개진 만큼 여러 개). */
  parts: FindMatchPart[];
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** 활성(다음/바꾸기 대상) 매치 인덱스. -1 = 없음. */
  activeIndex: number;
}

type FindMeta =
  | { type: "setQuery"; query: string }
  | { type: "setCaseSensitive"; caseSensitive: boolean }
  | { type: "setActive"; index: number };

interface TextSegment {
  /** 이 세그먼트 첫 글자의 절대 문서 위치. */
  absFrom: number;
  /** 연결 문자열에서의 시작/끝 오프셋(끝은 exclusive). */
  start: number;
  end: number;
}

/** 텍스트블록 하나의 연결 문자열 + 세그먼트 맵. */
interface BlockText {
  text: string;
  segs: TextSegment[];
}

/** 문서의 모든 텍스트블록을 순회하며 연결 문자열을 수집. */
function collectBlocks(doc: ProsemirrorNode): BlockText[] {
  const blocks: BlockText[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const segs: TextSegment[] = [];
    // node.descendants 의 rel 은 부모 노드 시작 기준 오프셋 → 절대 위치 = pos + 1 + rel.
    node.descendants((child, rel) => {
      if (child.isText && child.text) {
        segs.push({ absFrom: pos + 1 + rel, start: text.length, end: text.length + child.text.length });
        text += child.text;
      } else if (child.type.name === "hardBreak") {
        // 줄바꾸기 지점 — 매칭이 가로지르지 못하게 분리자로 삽입.
        text += "\n";
      }
      return true;
    });
    if (segs.length) blocks.push({ text, segs });
    return false; // 인라인은 직접 처리했으니 더 내려가지 않음
  });
  return blocks;
}

/** 연결 문자열 오프셋 → 절대 문서 위치. o === text.length(블록 끝)는 마지막 세그먼트 끝. */
function offsetToAbs(segs: TextSegment[], o: number): number {
  for (const seg of segs) {
    if (o >= seg.start && o < seg.end) return seg.absFrom + (o - seg.start);
  }
  const last = segs[segs.length - 1];
  return last.absFrom + (last.end - last.start);
}

/** 검색 실행 — 쿼리·문서가 같으면 항상 동일한 결과(순수 함수, 테스트 직접 호출 가능). */
export function computeMatches(doc: ProsemirrorNode, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: FindMatch[] = [];
  for (const block of collectBlocks(doc)) {
    const hay = caseSensitive ? block.text : block.text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const s = i;
      const e = i + query.length;
      const parts: FindMatchPart[] = [];
      for (const seg of block.segs) {
        const from = Math.max(s, seg.start);
        const to = Math.min(e, seg.end);
        if (from < to) {
          parts.push({ from: seg.absFrom + (from - seg.start), to: seg.absFrom + (to - seg.start) });
        }
      }
      // 하드브레이크(\n) 위에만 걸친 매치 등 세그먼트가 없으면 스킵.
      if (parts.length) matches.push({ from: offsetToAbs(block.segs, s), to: offsetToAbs(block.segs, e), parts });
      // 겹치지 않는 다음 매치로 진행(빈 진행 방지 — query 는 non-empty 보장).
      i = hay.indexOf(needle, e);
    }
  }
  return matches;
}

/** 선택 위치(cursor) 기준 "다음" 매치 인덱스 — 커서 뒤 첫 매치, 없으면 처음(회전). */
function nearestMatchIndex(matches: FindMatch[], cursor: number): number {
  const idx = matches.findIndex((m) => m.from >= cursor);
  return idx === -1 ? 0 : idx;
}

export const findReplacePluginKey = new PluginKey<FindState>("findReplace");

/** UI(FindReplaceBar)가 플러그인 상태(매치 수·활성 인덱스)를 읽는 접근자. */
export function getFindState(editorOrState: { state: EditorState } | EditorState): FindState | null {
  const state = "state" in editorOrState ? editorOrState.state : editorOrState;
  return findReplacePluginKey.getState(state) ?? null;
}

const initialFindState: FindState = { query: "", caseSensitive: false, matches: [], activeIndex: -1 };

const findPlugin = new Plugin<FindState>({
  key: findReplacePluginKey,
  state: {
    init: () => initialFindState,
    apply(tr, prev, _old, newState) {
      const meta = tr.getMeta(findReplacePluginKey) as FindMeta | undefined;
      let { query, caseSensitive, activeIndex } = prev;
      let forced = false;
      if (meta?.type === "setQuery") {
        query = meta.query;
        forced = true;
      } else if (meta?.type === "setCaseSensitive") {
        caseSensitive = meta.caseSensitive;
        forced = true;
      } else if (meta?.type === "setActive") {
        activeIndex = meta.index;
      }
      // 쿼리 변경 또는 문서 편집 시 매치 재계산 — 검색 중 본문을 고치면 하이라이트가 실시간 따라온다.
      let matches = prev.matches;
      if (forced || tr.docChanged) {
        matches = computeMatches(newState.doc, query, caseSensitive);
      }
      // 쿼리/대소문자 변경 시 첫 매치로 리셋, 문서 변경 시엔 클램프만(바꾸기 후 다음 매치 자연 지목).
      if (forced) {
        activeIndex = matches.length ? 0 : -1;
      } else if (activeIndex >= matches.length) {
        activeIndex = matches.length ? matches.length - 1 : -1;
      }
      if (
        matches === prev.matches &&
        query === prev.query &&
        caseSensitive === prev.caseSensitive &&
        activeIndex === prev.activeIndex
      ) {
        return prev;
      }
      return { query, caseSensitive, matches, activeIndex };
    },
  },
  props: {
    decorations(state) {
      const s = findReplacePluginKey.getState(state);
      if (!s || !s.matches.length) return null;
      const decos: Decoration[] = [];
      s.matches.forEach((m, i) => {
        const cls = i === s.activeIndex ? "rm-find-active" : "rm-find-match";
        for (const p of m.parts) {
          decos.push(Decoration.inline(p.from, p.to, { class: cls }));
        }
      });
      return DecorationSet.create(state.doc, decos);
    },
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      /** 검색어 설정(빈 문자열 = 하이라이트 해제). 매치는 즉시 재계산된다. */
      setFindQuery: (query: string) => ReturnType;
      /** 대/소문자 구분 토글. */
      setFindCaseSensitive: (caseSensitive: boolean) => ReturnType;
      /** 다음/이전 매치로 이동(선택 + 스크롤). 매치가 없으면 false. */
      findNextMatch: (backward?: boolean) => ReturnType;
      /** 활성 매치를 치환. 활성 매치가 없으면 다음 매치로 이동만(Words의 "찾아서 바꾸기" 순서). */
      replaceFindMatch: (replacement: string) => ReturnType;
      /** 모든 매치 치환 — 역방향 단일 트랜잭션(undo 1스텝). */
      replaceAllFindMatches: (replacement: string) => ReturnType;
    };
  }
}

export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [findPlugin];
  },

  addCommands() {
    return {
      setFindQuery:
        (query: string) =>
        ({ state, dispatch }) => {
          if (dispatch) dispatch(state.tr.setMeta(findReplacePluginKey, { type: "setQuery", query }));
          return true;
        },
      setFindCaseSensitive:
        (caseSensitive: boolean) =>
        ({ state, dispatch }) => {
          if (dispatch)
            dispatch(state.tr.setMeta(findReplacePluginKey, { type: "setCaseSensitive", caseSensitive }));
          return true;
        },
      findNextMatch:
        (backward = false) =>
        ({ state, dispatch }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || !s.matches.length) return false;
          let next: number;
          if (s.activeIndex >= 0 && s.activeIndex < s.matches.length) {
            next = (s.activeIndex + (backward ? -1 : 1) + s.matches.length) % s.matches.length;
          } else {
            next = nearestMatchIndex(s.matches, state.selection.to);
          }
          const m = s.matches[next];
          if (dispatch) {
            const tr = state.tr.setMeta(findReplacePluginKey, { type: "setActive", index: next });
            tr.setSelection(TextSelection.create(state.doc, m.from, m.to)).scrollIntoView();
            dispatch(tr);
          }
          return true;
        },
      replaceFindMatch:
        (replacement: string) =>
        ({ state, dispatch }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || !s.matches.length) return false;
          if (s.activeIndex < 0 || s.activeIndex >= s.matches.length) {
            // 활성 매치 없음 — 다음 매치 선택만. 다시 누르면 치환된다.
            const idx = nearestMatchIndex(s.matches, state.selection.to);
            const m = s.matches[idx];
            if (dispatch) {
              const tr = state.tr.setMeta(findReplacePluginKey, { type: "setActive", index: idx });
              tr.setSelection(TextSelection.create(state.doc, m.from, m.to)).scrollIntoView();
              dispatch(tr);
            }
            return true;
          }
          const m = s.matches[s.activeIndex];
          // 문서 변경 → 플러그인 apply 에서 매치 재계산. 치환된 텍스트가 쿼리에 더 이상
          // 맞지 않으면 같은 인덱스가 자연히 다음 매치를 가리킨다(자동 진행).
          if (dispatch) dispatch(state.tr.insertText(replacement, m.from, m.to));
          return true;
        },
      replaceAllFindMatches:
        (replacement: string) =>
        ({ state, dispatch }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || !s.matches.length) return false;
          if (dispatch) {
            const tr = state.tr;
            // 문서 뒤→앞 역방향 처리: 앞쪽 매치 위치는 뒤쪽 치환의 영향을 받지 않는다.
            // 단일 트랜잭션 → undo 1스텝. 재계산을 거치지 않아 치환 결과가 다시 매칭되지 않는다.
            for (let i = s.matches.length - 1; i >= 0; i--) {
              const m = s.matches[i];
              tr.insertText(replacement, m.from, m.to);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
