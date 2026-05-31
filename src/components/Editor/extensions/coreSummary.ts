import { Mark } from "@tiptap/core";

export const CoreSummaryExtension = Mark.create({
  name: "coreSummary",

  addAttributes() {
    return {
      "data-core-summary": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-core-summary"),
        renderHTML: (attributes) => {
          if (!attributes["data-core-summary"]) return {};
          return { "data-core-summary": attributes["data-core-summary"] };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-core-summary]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});
