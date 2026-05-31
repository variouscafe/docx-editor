import { Node } from "@tiptap/core";

export const TitleExtension = Node.create({
  name: "title",
  group: "block",
  content: "inline*",
  inline: false,
  selectable: false,

  addAttributes() {
    return {
      "data-title": {
        default: "true",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => {
          return { "data-title": attributes["data-title"] || "true" };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-title]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },
});
