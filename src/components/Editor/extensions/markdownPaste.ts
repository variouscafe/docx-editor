import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { marked } from "marked";

export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (_view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;

            const hasMarkdown =
              /^[#]{1,6}\s/m.test(text) ||
              /^[-*+]\s/m.test(text) ||
              /^\d+[.)]\s/m.test(text) ||
              /\*\*[^*]+\*\*/.test(text);

            if (!hasMarkdown) return false;

            event.preventDefault();

            const html = marked.parse(text, { async: false }) as string;

            requestAnimationFrame(() => {
              editor.chain().focus().insertContent(html).run();
            });

            return true;
          },
        },
      }),
    ];
  },
});
