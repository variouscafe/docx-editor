// @vitest-environment jsdom
/**
 * 찾기/바꾸기 확장 검증(실제 TipTap Editor + jsdom).
 *  - 마크 경계를 가로지르는 매칭(굵게 등으로 텍스트 노드가 쪼개진 경우)
 *  - 문단/줄바꿈(hardBreak) 경계는 가로지르지 않음
 *  - 대/소문자 구분, 바꾸기(자동 진행), 모두 바꾸기(단일 undo)
 *  - 매치 하이라이트 Decoration 렌더(비영속 — getJSON 오염 없음)
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FindReplace, getFindState } from "./findReplace";

const editors: Editor[] = [];

function makeEditor(content: object): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ bulletList: false, orderedList: false, listItem: false }),
      FindReplace,
    ],
    content: content as never,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("computeMatches — 매칭 범위", () => {
  it("굵게 마크 경계를 가로지르는 검색어를 찾는다", () => {
    // "보고" + "서"(bold) + "입니다" — 텍스트 노드 3개로 쪼개짐
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "보고" },
            { type: "text", marks: [{ type: "bold" }], text: "서" },
            { type: "text", text: "입니다" },
          ],
        },
      ],
    });
    editor.commands.setFindQuery("보고서");
    const s = getFindState(editor)!;
    expect(s.matches.length).toBe(1);
    expect(s.matches[0].from).toBe(1);
    expect(s.matches[0].to).toBe(1 + "보고서".length);
    // 마크 경계만큼 세그먼트 분할
    expect(s.matches[0].parts.length).toBe(2);
  });

  it("문단 경계는 가로지르지 않는다", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "보고" }] }, { type: "paragraph", content: [{ type: "text", text: "서류" }] }],
    });
    editor.commands.setFindQuery("보고서");
    expect(getFindState(editor)!.matches.length).toBe(0);
  });

  it("Shift+Enter(hardBreak)를 가로지르지 않는다", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "가나" },
            { type: "hardBreak" },
            { type: "text", text: "다라" },
          ],
        },
      ],
    });
    editor.commands.setFindQuery("가나다라");
    expect(getFindState(editor)!.matches.length).toBe(0);
    // hardBreak 양옆은 각각 매칭
    editor.commands.setFindQuery("가나");
    expect(getFindState(editor)!.matches.length).toBe(1);
  });

  it("대/소문자 구분 토글이 매치 수에 반영된다", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Word word WORD" }] }],
    });
    editor.commands.setFindQuery("word");
    expect(getFindState(editor)!.matches.length).toBe(3);
    editor.commands.setFindCaseSensitive(true);
    expect(getFindState(editor)!.matches.length).toBe(1);
  });

  it("빈 쿼리는 매치 없음", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "abc" }] }] });
    editor.commands.setFindQuery("");
    expect(getFindState(editor)!.matches.length).toBe(0);
  });
});

describe("바꾸기", () => {
  const DOC = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "회수 회수 회수" }] }],
  };

  it("replaceFindMatch — 활성 매치 치환 후 같은 인덱스가 다음 매치를 가리킨다", () => {
    const editor = makeEditor(DOC);
    editor.commands.setFindQuery("회수");
    let s = getFindState(editor)!;
    expect(s.activeIndex).toBe(0); // 쿼리 설정 시 첫 매치 활성
    expect(editor.state.doc.textContent).toBe("회수 회수 회수");

    expect(editor.commands.replaceFindMatch("횟수")).toBe(true);
    expect(editor.state.doc.textContent).toBe("횟수 회수 회수");
    s = getFindState(editor)!;
    expect(s.matches.length).toBe(2);
    expect(s.activeIndex).toBe(0); // 다음 매치 지목
  });

  it("replaceAllFindMatches — 전부 치환 + undo 1스텝 복원", () => {
    const editor = makeEditor(DOC);
    editor.commands.setFindQuery("회수");
    expect(editor.commands.replaceAllFindMatches("횟수")).toBe(true);
    expect(editor.state.doc.textContent).toBe("횟수 횟수 횟수");
    expect(getFindState(editor)!.matches.length).toBe(0);

    // 단일 트랜잭션 → undo 한 번에 원문 복원
    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe("회수 회수 회수");
  });

  it("치환 결과가 쿼리에 다시 매칭되지 않는다(무한 치환 방지)", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "aa" }] }],
    });
    editor.commands.setFindQuery("a");
    editor.commands.replaceAllFindMatches("ba");
    // replaceAll 은 원본 매치 2개만 치환 — 삽입된 "ba" 의 "a" 가 다시 치환되지 않음
    expect(editor.state.doc.textContent).toBe("baba");
  });

  it("치환이 마크를 유지한다(활성 매치의 첫 세그먼트 서식 상속)", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks: [{ type: "bold" }], text: "회수 보고" }],
        },
      ],
    });
    editor.commands.setFindQuery("회수");
    editor.commands.replaceFindMatch("횟수");
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe("bold");
  });
});

describe("Decoration·저장 무결성", () => {
  it("매치 하이라이트가 DOM 에 렌더되고 getJSON 은 오염되지 않는다", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "1. 결산 보고와 보고서" }] }],
    });
    editor.commands.setFindQuery("보고");
    // 쿼리 설정 시 첫 매치가 활성(active), 나머지는 일반(match) 하이라이트.
    // (첫 트랜잭션에서 StarterKit trailingNode 가 빈 문단을 정규화 추가함 — 앱 기존 동작)
    expect(editor.view.dom.querySelectorAll(".rm-find-match").length).toBe(1);
    expect(editor.view.dom.querySelectorAll(".rm-find-active").length).toBe(1);

    const beforeNav = editor.getJSON();
    editor.commands.findNextMatch();
    expect(editor.view.dom.querySelectorAll(".rm-find-active").length).toBe(1);
    // 선택 이동은 커서만 옮긴다 — 문서 변경 없음
    expect(editor.getJSON()).toEqual(beforeNav);

    // 쿼리 해제 → 하이라이트 제거
    editor.commands.setFindQuery("");
    expect(editor.view.dom.querySelector(".rm-find-match")).toBeNull();
    expect(editor.view.dom.querySelector(".rm-find-active")).toBeNull();
  });

  it("검색 중 본문을 편집하면 매치가 재계산된다", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "회수 회수" }] }],
    });
    editor.commands.setFindQuery("회수");
    expect(getFindState(editor)!.matches.length).toBe(2);
    editor.commands.insertContentAt(0, "회수 ");
    expect(getFindState(editor)!.matches.length).toBe(3);
  });

  it("findNextMatch 회전 — 마지막 다음은 처음으로", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a a a" }] }],
    });
    editor.commands.setFindQuery("a");
    editor.commands.findNextMatch(); // 0 → 1
    editor.commands.findNextMatch(); // 1 → 2
    editor.commands.findNextMatch(); // 2 → 0(회전)
    const s = getFindState(editor)!;
    expect(s.activeIndex).toBe(0);
    editor.commands.findNextMatch(true); // 뒤로
    expect(getFindState(editor)!.activeIndex).toBe(s.matches.length - 1);
  });

  it("매치가 없으면 findNextMatch 는 false", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "abc" }] }] });
    editor.commands.setFindQuery("zzz");
    expect(editor.commands.findNextMatch()).toBe(false);
    expect(editor.commands.replaceFindMatch("x")).toBe(false);
    expect(editor.commands.replaceAllFindMatches("x")).toBe(false);
  });
});
