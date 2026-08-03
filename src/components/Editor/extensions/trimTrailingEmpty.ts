import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * 문서 끝(trailing)의 연속된 빈 문단(paragraph)을 1개로 정리.
 *
 * 배경: 헤딩 input rule(`### ` → 헤딩) 변환 직후 끝에 빈 문단이 1개 추가되는 동작이 있어,
 * 헤딩에서 Enter를 치면 빈 문단이 2개씩 생기는 문제가 발생한다.
 * 문서 끝의 빈 줄 2개 이상은 의미가 없으므로 1개로 줄인다.
 * (문서 중간의 빈 줄은 사용자 의도일 수 있으므로 건드리지 않는다.)
 */
export const TrimTrailingEmpty = Extension.create({
  name: "trimTrailingEmpty",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("trimTrailingEmpty"),
        appendTransaction: (_trs, _oldState, state) => {
          const doc = state.doc;
          const count = doc.childCount;
          if (count < 2) return null;

          // 끝에서부터 연속된 빈 paragraph 개수
          let emptyTail = 0;
          for (let i = count - 1; i >= 0; i--) {
            const child = doc.child(i);
            if (child.type.name === "paragraph" && child.content.size === 0) emptyTail++;
            else break;
          }
          if (emptyTail < 2) return null;

          // 끝에서 (emptyTail - 1)개 삭제 → 빈 문단 1개만 남김
          let removeSize = 0;
          for (let i = 0; i < emptyTail - 1; i++) {
            removeSize += doc.child(count - 1 - i).nodeSize;
          }
          const from = doc.content.size - removeSize;
          const tr = state.tr.delete(from, doc.content.size);
          return tr;
        },
      }),
    ];
  },
});
