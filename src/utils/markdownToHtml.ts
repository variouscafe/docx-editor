import { Marked, type Tokens } from "marked";

// Custom inline tokenizer + renderer extensions for custom markdown syntax

/** ++text++ → <span data-border="solid">text</span> */
const solidBoxExtension = {
  name: "solidBox",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("++");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^\+\+(.+?)\+\+/.exec(src);
    if (!match) return undefined;
    return {
      type: "solidBox",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<span data-border="solid">${token.text}</span>`;
  },
};

/** ~~text~~ → <span data-border="dashed">text</span> */
const dashedBoxExtension = {
  name: "dashedBox",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("~~");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^~~(.+?)~~/.exec(src);
    if (!match) return undefined;
    return {
      type: "dashedBox",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<span data-border="dashed">${token.text}</span>`;
  },
};

/** ==text== → <mark data-color="#fef08a">text</mark>
 *  ==text=={#hex} → <mark data-color="#hex">text</mark> */
const highlightExtension = {
  name: "highlight",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("==");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^==(.+?)==(?:\{(#\w+)\})?/.exec(src);
    if (!match) return undefined;
    return {
      type: "highlight",
      raw: match[0],
      text: match[1],
      color: match[2] || "#fef08a",
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<mark data-color="${token.color}">${token.text}</mark>`;
  },
};

/** ^^text^^ → <u>text</u> */
const underlineExtension = {
  name: "underline",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("^^");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^\^\^(.+?)\^\^/.exec(src);
    if (!match) return undefined;
    return {
      type: "underline",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<u>${token.text}</u>`;
  },
};

/** {{text|annotation}} → <span data-annotation="annotation">text</span> */
const annotationExtension = {
  name: "annotation",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("{{");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^\{\{(.+?)\|(.+?)\}\}/.exec(src);
    if (!match) return undefined;
    return {
      type: "annotation",
      raw: match[0],
      text: match[1],
      annotation: match[2],
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<span data-annotation="${token.annotation}">${token.text}</span>`;
  },
};

// Create a configured Marked instance with custom extensions
const markedInstance = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    annotationExtension,
    highlightExtension,
    solidBoxExtension,
    dashedBoxExtension,
    underlineExtension,
  ],
});

/**
 * Convert markdown text to HTML.
 * Supports custom syntax: ++solid box++, ~~dashed box~~, ==highlight==, ^^underline^^
 */
export function markdownToHtml(md: string): string {
  const result = markedInstance.parse(md, { async: false });
  return typeof result === "string" ? result : "";
}
