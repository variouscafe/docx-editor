import { Mark } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotation: {
      setAnnotation: (text: string) => ReturnType;
      unsetAnnotation: () => ReturnType;
    };
  }
}

export const AnnotationExtension = Mark.create({
  name: "annotation",

  addAttributes() {
    return {
      "data-annotation": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-annotation"),
        renderHTML: (attributes) => {
          if (!attributes["data-annotation"]) return {};
          return { "data-annotation": attributes["data-annotation"] };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-annotation]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setAnnotation:
        (text: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, {
            "data-annotation": text,
          });
        },
      unsetAnnotation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
