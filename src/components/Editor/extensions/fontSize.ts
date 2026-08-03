import { Mark } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (pt: number) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/**
 * 폰트사이즈 마크 — 인라인 run 단위 폰트크기(pt).
 * JSON: { type:'fontSize', attrs:{ fontSize: 18 } }.
 * 렌더: <span data-font-size="18" style="font-size: 18pt">. BE docx 생성기는 attrs.fontSize * 2(half-point) 적용.
 */
export const FontSize = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-font-size");
          if (v) return Number(v);
          const m = (element as HTMLElement).style?.fontSize?.match(/(\d+(?:\.\d+)?)pt/);
          return m ? Number(m[1]) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return {
            "data-font-size": String(attributes.fontSize),
            style: `font-size: ${attributes.fontSize}pt`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-font-size]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setFontSize:
        (pt: number) =>
        ({ commands }) => {
          return commands.setMark(this.name, { fontSize: pt });
        },
      unsetFontSize:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
