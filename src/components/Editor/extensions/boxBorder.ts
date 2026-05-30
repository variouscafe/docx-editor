import { Mark } from "@tiptap/core";

export interface BoxBorderOptions {
  HTMLAttributes: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    boxBorder: {
      setSolidBox: () => ReturnType;
      setDashedBox: () => ReturnType;
      unsetBox: () => ReturnType;
    };
  }
}

export const BoxBorder = Mark.create<BoxBorderOptions>({
  name: "boxBorder",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-border="solid"]',
      },
      {
        tag: 'span[data-border="dashed"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setSolidBox:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name, {
            "data-border": "solid",
          });
        },
      setDashedBox:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name, {
            "data-border": "dashed",
          });
        },
      unsetBox:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
