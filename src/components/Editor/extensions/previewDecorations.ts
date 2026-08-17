import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { DocxOptions } from "@shared/options";
import { isBoldSymbol } from "@shared/lineStartSymbol";
import { type HeadingKey } from "@shared/symbols";

/**
 * 미리보기 장식(비영속) — 라인 시작 기호·카운터·CONTENT_BRACKET 괄호·꼬마글씨2 문단을
 * ProseMirror Decoration 으로 렌더. getJSON() 에는 절대 포함되지 않으므로 저장 콘텐츠는 항상 깨끗함.
 * BE docx 생성기와 동일 로직(@shared/symbols) 사용 → 미리보기와 내보내기가 일치.
 */
export const previewDecorationsKey = new PluginKey<DecorationSet>("previewDecorations");

/** 옵션 변경 시 장식을 강제 재계산(옵션 홀더는 getter 가 최신값을 반환). */
export function forceRedecorate(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(previewDecorationsKey, true));
}

function collectAnnotations(node: PmNode): string[] {
  const anns: string[] = [];
  // 연속 같은 주석 = 하나의 꼬마글씨 마크가 굵게/hardBreak 등으로 여러 노드에 걸친 것 —
  // 1회만 수집(중복 ○ 문단 방지). 주석 없는 노드로 끊긴 뒤의 같은 텍스트는 별도 주석.
  let prev: string | null = null;
  node.descendants((child) => {
    const ann = child.marks.find((m) => m.type.name === "annotation")?.attrs["data-annotation"];
    const a = typeof ann === "string" && ann ? ann : null;
    if (a && a !== prev) anns.push(a);
    prev = a;
    return true;
  });
  return anns;
}

/** 노드별 안정 id — 장식 widget key 로 사용. PM 은 같은 key 의 위젯을 동일하게 보고
 *  DOM 을 재사용하므로, 매 트랜잭션마다 장식을 새로 만들어도 편집 안 된 블록의
 *  ○ 문단/↵ 위젯 DOM 이 파괴·재생성되지 않는다(불필요한 DOM 작업/깜빡임 제거). */
const nodeIds = new WeakMap<PmNode, string>();
let nodeIdSeq = 0;
function stableNodeId(node: PmNode): string {
  let id = nodeIds.get(node);
  if (!id) {
    id = `d${++nodeIdSeq}`;
    nodeIds.set(node, id);
  }
  return id;
}

function buildDecorations(editor: Editor, doc: PmNode, options: DocxOptions): DecorationSet {
  const decos: Decoration[] = [];

  /** 꼬마글씨 Mode 2: 블록 뒤에 ○ 주석 문단 위젯들. */
  const pushAnnotation2Widgets = (node: PmNode, offset: number) => {
    if (options.annotationMode !== 2) return;
    const anns = collectAnnotations(node);
    const baseId = stableNodeId(node);
    anns.forEach((a, i) => {
      decos.push(
        Decoration.widget(
          offset + node.nodeSize,
          () => {
            const p = document.createElement("p");
            p.setAttribute("data-annotation-paragraph", "true");
            p.textContent = `${options.annotation2.symbol} ${a}`;
            return p;
          },
          { side: 1, key: `a2:${baseId}:${i}` }
        )
      );
    });
  };

  // doc.descendants 로 전체 트리 순회 — 표 셀 안 단락·헤딩의 주석도 mode2 위젯으로 렌더.
  // (기존 최상위 문단만 순회하는 방식은 표 셀/헤딩 내 주석이 미리보기에서 사라졌다.
  //  DOCX 내보내기는 셀/헤딩 주석을 이미 처리하므로 미리보기 정합성 맞춤.)
  doc.descendants((node, pos) => {
    const name = node.type.name;

    if (name === "heading") {
      const level = (node.attrs.level ?? 1) as number;
      const key = `h${level}` as HeadingKey;
      const symbol = options[key].lineStartSymbol;
      // prefix(공백+기호)는 이제 실제 텍스트(headingPrefix mark)이므로 위젯 불필요.
      // 굵은 기호(1., 1), □, Ⅰ) 헤딩만 본문까지 굵게 표시.
      if (isBoldSymbol(symbol)) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-bold-symbol": "true" }));
      }
      pushAnnotation2Widgets(node, pos);
      return true;
    }
    if (name === "paragraph" || name === "title") {
      pushAnnotation2Widgets(node, pos);
    }
    // 표 셀(tableCell/tableHeader)도 내부 단락을 그대로 순회하게 둔다.
    return true;
  });

  // 강제 줄바꿈(hardBreak, Shift+Enter) 위치에 ↵ 표시 — 편집 모드에서만.
  // <br>은 void 요소라 ::after/::before 로 내용을 넣을 수 없어 위젯으로 렌더.
  // ↵는 hardBreak 노드 시작 위치(= 줄 끝)에 두어 워드의 강제줄바꿈 표시와 동일하게.
  if (editor.isEditable) {
    doc.descendants((node, pos) => {
      if (node.type.name === "hardBreak") {
        decos.push(
          Decoration.widget(
            pos,
            () => {
              const span = document.createElement("span");
              span.className = "rm-hardbreak-mark";
              span.textContent = "↵";
              return span;
            },
            { side: -1, key: `hb:${stableNodeId(node)}` }
          )
        );
      }
      return true;
    });
  }

  return DecorationSet.create(doc, decos);
}

export const PreviewDecorations = Extension.create<{ getOptions: () => DocxOptions }>({
  name: "previewDecorations",

  addOptions() {
    return { getOptions: () => ({}) as DocxOptions };
  },

  addProseMirrorPlugins() {
    const getOptions = this.options.getOptions;
    const editor = this.editor;
    return [
      new Plugin({
        key: previewDecorationsKey,
        state: {
          init: (_config, state) => buildDecorations(editor, state.doc, getOptions()),
          apply: (tr, old, _oldState, newState) => {
            if (tr.docChanged || tr.getMeta(previewDecorationsKey)) {
              return buildDecorations(editor, newState.doc, getOptions());
            }
            return old;
          },
        },
        props: {
          decorations: (state) => previewDecorationsKey.getState(state),
        },
      }),
    ];
  },
});
