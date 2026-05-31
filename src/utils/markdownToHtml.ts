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

/** [text] → <span data-core-summary="true">text</span>
 *  미리보기 CSS에서 [ ] 괄호 형태로 렌더링, DOCX에서는 3셀 테이블로 export
 *  마크다운 링크 [text](url) 와 구분하기 위해 ] 뒤에 ( 또는 [ 가 없는 경우만 매칭 */
const coreSummaryExtension = {
  name: "coreSummary",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("[");
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^\[([^\]]+?)\](?!\(|\[)/.exec(src);
    if (!match) return undefined;
    return {
      type: "coreSummary",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: Tokens.Generic): string {
    const content = token.text.replace(/\n/g, "<br>");
    return `<span data-core-summary="true">${content}</span>`;
  },
};

/** ! text → <div data-title="true" style="text-align: center">text</div> */
const titleExtension = {
  name: "title",
  level: "block" as const,
  start(src: string) {
    return src.match(/^! /m)?.index ?? -1;
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    const match = /^! (.+)/.exec(src);
    if (!match) return undefined;
    return {
      type: "title",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: Tokens.Generic): string {
    return `<div data-title="true" style="text-align: center">${token.text}</div>`;
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
    coreSummaryExtension,
    titleExtension,
  ],
});

/**
 * Convert markdown text to HTML.
 * Supports custom syntax: ++solid box++, ~~dashed box~~, ==highlight==, ^^underline^^, {{text|annotation}}
 * Line-end alignment: ` >>` = right, ` <>` = center, ` <<` = left
 */
export function markdownToHtml(md: string): string {
  const result = markedInstance.parse(md, { async: false });
  const html = typeof result === "string" ? result : "";
  return applyAlignmentMarkers(html);
}

/**
 * Post-process HTML to handle line-end alignment markers.
 * marked encodes >> as &gt;&gt; and <> as &lt;&gt; in text content.
 * Pattern: <tag>... MARKER</tag> → <tag style="text-align: ...">...</tag>
 */
function applyAlignmentMarkers(html: string): string {
  // Negative lookahead (?!<\/...) prevents [\s\S] from crossing block element boundaries
  // \1 backreference ensures closing tag matches opening tag

  // Right align: content &gt;&gt;</tag>
  html = html.replace(
    /<(h[1-6]|p)([^>]*)>((?:(?!<\/(?:h[1-6]|p)>)[\s\S])*?) &gt;&gt;<\/\1>/g,
    '<$1$2 style="text-align: right">$3</$1>'
  );
  // Center align: content &lt;&gt;</tag>
  html = html.replace(
    /<(h[1-6]|p)([^>]*)>((?:(?!<\/(?:h[1-6]|p)>)[\s\S])*?) &lt;&gt;<\/\1>/g,
    '<$1$2 style="text-align: center">$3</$1>'
  );
  // Left align: content &lt;&lt;</tag>
  html = html.replace(
    /<(h[1-6]|p)([^>]*)>((?:(?!<\/(?:h[1-6]|p)>)[\s\S])*?) &lt;&lt;<\/\1>/g,
    '<$1$2 style="text-align: left">$3</$1>'
  );
  return html;
}
