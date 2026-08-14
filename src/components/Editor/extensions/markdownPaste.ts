import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { markdownToHtml } from "@/utils/markdownToHtml";

export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (_view, event) => {
            // HTML 이 있으면 PM 기본 HTML 파싱에 맡긴다 — 워드/구글 독스 복사는 plain text
            // 미러에 "1. " 등을 포함해 md 패턴으로 오인되고, md 변환을 강제하면 서식이 손실된다.
            const html = event.clipboardData?.getData("text/html");
            if (html) return false;

            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;

            const hasMarkdown =
              /^[#]{1,6}\s/m.test(text) ||
              /^[-*+]\s/m.test(text) ||
              /^\d+[.)]\s/m.test(text) ||
              /\*\*[^*]+\*\*/.test(text) ||
              // 자체 content_md 문법(가져오기/내보내기 round-trip 지원)
              /\+\+[^+]+\+\+/.test(text) ||
              /==[^=]+==/.test(text) ||
              /\^\^[^^]+\^\^/.test(text) ||
              /\{\{[^}|]+\|[^}]+\}\}/.test(text);

            if (!hasMarkdown) return false;

            event.preventDefault();

            // 커스텀 marked 인스턴스(박스/형광펜/밑줄/꼬마글씨/핵심요약 확장 포함)로 변환 —
            // 기본 marked 는 ++box++ 를 리터럴로, ~~dashed~~ 를 취소선으로 오변환한다.
            const htmlContent = markdownToHtml(text);

            requestAnimationFrame(() => {
              editor.chain().focus().insertContent(htmlContent).run();
            });

            return true;
          },
        },
      }),
    ];
  },
});
