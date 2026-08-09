import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

/**
 * 표 셀 안에서 Backspace/Delete(및 모바일 beforeinput)가 셀 경계를 넘어
 * 행/열/표 구조를 훼손하는 것을 막는 가드.
 *
 * 배경(모바일 재현): 빈 셀이나 셀 맨 앞·맨 끝에서 delete(Backspace)를 길게 누르면
 * ProseMirror의 joinBackward/joinForward 가 셀 밖으로 빠져나가 표 행이 통째로
 * 삭제되거나 셀이 병합되는 현상이 발생한다.
 *
 * 전략: 셀 내부의 일반 텍스트 삭제는 허용하되,
 *  - 커서가 (셀의 첫 블록) 맨 앞(빈 셀 포함)에서 Backspace → 차단
 *  - 커서가 (셀의 마지막 블록) 맨 끝에서 Delete(전진) → 차단
 * 셀 밖으로 이어지는 삭제만 막는다. 셀 다중 선택(CellSelection)·범위 선택은
 * 표 확장의 정상 동작(내용 삭제)에 맡긴다.
 *
 * 입력 경로 2종 모두 가로챈다:
 *  - 데스크톱: handleKeyDown (Backspace/Delete 키)
 *  - 모바일:   beforeinput (inputType deleteContentBackward/Forward)
 * 모바일 키보드의 delete 는 keydown 이 아닌 beforeinput 으로 발생하므로 둘 다 잡아야 한다.
 *
 * 우선순위(1000)로 StarterKit 의 keymap(기본 100) 보다 먼저 실행되어,
 * keymap 이 Backspace→joinBackward 트랜잭션을 만들기 전에 가로챈다.
 */
export const tableDeleteGuardKey = new PluginKey("tableDeleteGuard");

type DeleteDir = "backward" | "forward";

/** $pos 의 조상 중 표 셀(tableCell/tableHeader) 깊이 반환. 없으면 null. */
function cellDepth($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d)?.type?.name;
    if (name === "tableCell" || name === "tableHeader") return d;
  }
  return null;
}

/**
 * 현재 선택 상태에서 지정 방향의 삭제가 셀 경계를 넘는지(=막아야 하는지) 판단.
 * 순수 함수 — 별도 단위 테스트로 검증. 가드 플러그인이 호출한다.
 */
export function shouldBlockCellDelete(state: EditorState, dir: DeleteDir): boolean {
  const { selection } = state;
  // 범위/노드/셀 다중 선택은 표 확장 정상 동작에 맡김.
  if (!selection.empty) return false;
  const $head = selection.$head;
  const depth = cellDepth($head);
  if (depth == null) return false; // 표 밖

  const cell = $head.node(depth);
  const block = $head.parent; // 커서가 있는 텍스트블록(보통 paragraph)
  const blockDepth = $head.depth;

  if (dir === "backward") {
    // 셀의 첫 블록 맨 앞 → 뒤로 지우면 셀 밖으로 이탈
    return cell.firstChild === block && $head.pos === $head.start(blockDepth);
  }
  // 셀의 마지막 블록 맨 끝 → 앞으로 지우면 셀 밖으로 이탈
  return cell.lastChild === block && $head.pos === $head.end(blockDepth);
}

export const TableDeleteGuard = Extension.create({
  name: "tableDeleteGuard",

  // StarterKit keymap(기본 100) 보다 먼저 handleKeyDown 이 실행되도록.
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableDeleteGuardKey,
        props: {
          // 데스크톱 키보드
          handleKeyDown(_view, event) {
            if (event.key !== "Backspace" && event.key !== "Delete") return false;
            const dir: DeleteDir = event.key === "Backspace" ? "backward" : "forward";
            if (shouldBlockCellDelete(_view.state, dir)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          // 모바일 beforeinput(deleteContentBackward/Forward)
          handleDOMEvents: {
            beforeinput(_view, event) {
              const inputType = (event as InputEvent).inputType;
              if (inputType !== "deleteContentBackward" && inputType !== "deleteContentForward") {
                return false;
              }
              const dir: DeleteDir = inputType === "deleteContentBackward" ? "backward" : "forward";
              if (shouldBlockCellDelete(_view.state, dir)) {
                event.preventDefault();
                return true; // ProseMirror 내장 beforeinput 처리까지 차단
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
