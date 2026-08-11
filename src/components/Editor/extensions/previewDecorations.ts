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
  node.descendants((child) => {
    child.marks.forEach((m) => {
      if (m.type.name === "annotation" && m.attrs["data-annotation"]) {
        anns.push(m.attrs["data-annotation"] as string);
      }
    });
    return true;
  });
  return anns;
}

function buildDecorations(editor: Editor, doc: PmNode, options: DocxOptions): DecorationSet {
  const decos: Decoration[] = [];

  doc.forEach((node, offset) => {
    const name = node.type.name;

    if (name === "heading") {
      const level = (node.attrs.level ?? 1) as number;
      const key = `h${level}` as HeadingKey;
      const symbol = options[key].lineStartSymbol;
      // prefix(공백+기호)는 이제 실제 텍스트(headingPrefix mark)이므로 위젯 불필요.
      // 굵은 기호(1., 1), □, Ⅰ) 헤딩만 본문까지 굵게 표시.
      if (isBoldSymbol(symbol)) {
        decos.push(Decoration.node(offset, offset + node.nodeSize, { "data-bold-symbol": "true" }));
      }
    } else if (name === "paragraph" || name === "title") {
      // 꼬마글씨 Mode 2: 블록 뒤에 ○ 주석 문단 위젯.
      if (options.annotationMode === 2) {
        const anns = collectAnnotations(node);
        for (const a of anns) {
          decos.push(
            Decoration.widget(
              offset + node.nodeSize,
              () => {
                const p = document.createElement("p");
                p.setAttribute("data-annotation-paragraph", "true");
                p.textContent = `${options.annotation2.symbol} ${a}`;
                return p;
              },
              { side: 1 }
            )
          );
        }
      }
    }
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
            { side: -1 }
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
