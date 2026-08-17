import { Marked, type Tokens } from "marked";

// Custom inline tokenizer + renderer extensions for custom markdown syntax

/**
 * 커스텀 확장 공용 맥락 타입 — 내부 콘텐츠를 marked 로 재파싱(inlineTokens/parseInline)해
 * 중첩 마크를 보존한다. `++**굵게**++` 를 텍스트 그대로 삽입해 리터럴 `**` 가 새어 나가고
 * 굵게가 소실되던 왕복 결함(2026-08-17 점검 P2)의 수정.
 */
interface InlineTokenizerCtx {
  lexer: { inlineTokens(src: string, tokens?: Tokens.Generic[]): Tokens.Generic[] };
}
interface InlineRendererCtx {
  parser: { parseInline(tokens: unknown[]): string };
}

/** HTML 속성값 이스케이프 — 주석 텍스트의 따옴표가 태그를 깨지 않게. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** 꼬마글씨 주석 파트 언이스케이프 — jsonToMarkdown escapeAnnotationPart 역변환.
 *  (body 는 marked 표준 이스케이프 처리로 복원되므로 속성인 주석에만 필요) */
function unescapeAnnotationPart(s: string): string {
  return s.replace(/\\([\\|}])/g, "$1");
}

/** ++text++ → <span data-border="solid">text</span> */
const solidBoxExtension = {
  name: "solidBox",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("++");
  },
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^\+\+(.+?)\+\+/.exec(src);
    if (!match) return undefined;
    return {
      type: "solidBox",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<span data-border="solid">${this.parser.parseInline(token.tokens ?? [])}</span>`;
  },
};

/** ~~text~~ → <span data-border="dashed">text</span> */
const dashedBoxExtension = {
  name: "dashedBox",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("~~");
  },
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^~~(.+?)~~/.exec(src);
    if (!match) return undefined;
    return {
      type: "dashedBox",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<span data-border="dashed">${this.parser.parseInline(token.tokens ?? [])}</span>`;
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
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^==(.+?)==(?:\{(#\w+)\})?/.exec(src);
    if (!match) return undefined;
    return {
      type: "highlight",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
      color: match[2] || "#fef08a",
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<mark data-color="${escapeAttr(String(token.color ?? ""))}">${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

/** ^^text^^ → <u>text</u> */
const underlineExtension = {
  name: "underline",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("^^");
  },
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^\^\^(.+?)\^\^/.exec(src);
    if (!match) return undefined;
    return {
      type: "underline",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<u>${this.parser.parseInline(token.tokens ?? [])}</u>`;
  },
};

/** {{text|annotation}} → <span data-annotation="annotation">text</span>
 *  파트 경계 정규식 — 파트 내 |·}·\ 는 백슬래시 이스케이프로 구분자와 구별한다
 *  (jsonToMarkdown escapeAnnotationPart 와 짝. lazy 매칭은 이스케이프를 역추적하지
 *  못하므로 `\\.` 우선 패턴으로 명시 파싱). */
const ANNOTATION_RE = /^\{\{((?:\\.|[^|\\])*)\|((?:\\.|[^}\\])*)\}\}/;
const annotationExtension = {
  name: "annotation",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("{{");
  },
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = ANNOTATION_RE.exec(src);
    if (!match) return undefined;
    return {
      type: "annotation",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
      annotation: match[2],
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<span data-annotation="${escapeAttr(unescapeAnnotationPart(String(token.annotation ?? "")))}">${this.parser.parseInline(token.tokens ?? [])}</span>`;
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
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^\[([^\]]+?)\](?!\(|\[)/.exec(src);
    if (!match) return undefined;
    return {
      type: "coreSummary",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    // breaks:true — inlineTokens 가 \n 을 br 토큰으로 변환하므로 개행은 그대로 유지된다.
    return `<span data-core-summary="true">${this.parser.parseInline(token.tokens ?? [])}</span>`;
  },
};

/** ! text → <div data-title="true" style="text-align: center">text</div> */
const titleExtension = {
  name: "title",
  level: "block" as const,
  start(src: string) {
    return src.match(/^! /m)?.index ?? -1;
  },
  tokenizer(this: InlineTokenizerCtx, src: string): Tokens.Generic | undefined {
    const match = /^! (.+)/.exec(src);
    if (!match) return undefined;
    return {
      type: "title",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(this: InlineRendererCtx, token: Tokens.Generic): string {
    return `<div data-title="true" style="text-align: center">${this.parser.parseInline(token.tokens ?? [])}</div>`;
  },
};

/**
 * Pre-process markdown to merge heading continuation lines.
 * When a heading line is followed by non-blank, non-block lines
 * (no blank line between them), they are merged into the same heading
 * using %%BR%% as a line-break placeholder.
 *
 * Example:
 *   ### heading
 *      continuation text
 * becomes:
 *   ### heading%%BR%%   continuation text
 */
function preprocessMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line is a heading
    if (/^#{1,6}\s/.test(line)) {
      result.push(line);

      // Look ahead for continuation lines (no blank line between)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];

        // Stop conditions
        if (nextLine.trim() === '') break;                    // blank line
        if (/^#{1,6}\s/.test(nextLine)) break;                // another heading
        if (/^!\s/.test(nextLine)) break;                     // title
        if (/^[-*+]\s/.test(nextLine)) break;                 // unordered list
        if (/^\d+[.)]\s/.test(nextLine)) break;               // ordered list
        if (/^---+$/.test(nextLine.trim())) break;            // horizontal rule
        if (/^\*\*\*+$/.test(nextLine.trim())) break;         // horizontal rule
        if (/^___+$/.test(nextLine.trim())) break;            // horizontal rule

        // Merge with %%BR%% separator
        i++;
        result[result.length - 1] += '%%BR%%' + nextLine;
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

// Create a configured Marked instance with custom extensions
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
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
 * 이스케이프된 커스텀 기호 보호 — marked 커스텀 확장 토크나이저는 정규식 기반이라
 * 선행 백스케이시를 무시하고 위치 매칭한다(\[ 가 coreSummary 로 오변환 등).
 * 파싱 전 `\X` 이스케이프를 사립 영역(Private Use Area) 문자로 치환해 토크나이저가
 * 기호 자체를 못 보게 하고, HTML 생성 후 원문 기호로 복원한다(round-trip 보장).
 */
const SHIELD_MAP: Record<string, string> = {
  "[": "\uE100",
  "]": "\uE101",
  "=": "\uE102",
  "+": "\uE103",
  "~": "\uE104",
  "^": "\uE105",
  "{": "\uE106",
  "}": "\uE107",
  "!": "\uE108",
};
const UNSHIELD_RE = /[\uE100-\uE108]/g;
const UNSHIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SHIELD_MAP).map(([orig, shielded]) => [shielded, orig]),
);
function shieldCustomEscapes(md: string): string {
  // \[ \= \+ \~ \^ \{ \! — jsonToMarkdown 이 생성하는 커스텀 문법 이스케이프.
  // (! 포함 — title 확장의 start()/tokenizer 가 백슬래시를 무시하고 줄 시작 `! ` 을
  //  자르므로 표준 이스케이프로는 막을 수 없다. 나머지 기호들도 같은 이유로 센티널 보호.)
  return md.replace(/\\([\[\]=+~^{}!])/g, (_, c: string) => SHIELD_MAP[c] ?? c);
}

/**
 * Convert markdown text to HTML.
 * Supports custom syntax: ++solid box++, ~~dashed box~~, ==highlight==, ^^underline^^, {{text|annotation}}
 * Line-end alignment: ` >>` = right, ` <>` = center, ` <<` = left
 */
export function markdownToHtml(md: string): string {
  // 진짜 사립 영역 문자(E100-E108)를 HTML 엔티티로 선치환 — 하단 unshield 가 사용자
  // 문서의 PUA 문자를 커스텀 기호로 오복원하는 것을 방지(엔티티는 DOM 디코딩으로 복원).
  // %%BR%% 리터럴도 엔티티화 — 헤딩 개행 병합 마커로 오인돼 <br> 로 바뀌지 않게.
  const puaShielded = md
    .replace(/[-]/g, (c) => `&#x${c.charCodeAt(0).toString(16)};`)
    .replace(/%%BR%%/g, "&#37;&#37;BR&#37;&#37;");
  const preprocessed = shieldCustomEscapes(preprocessMarkdown(puaShielded));
  const result = markedInstance.parse(preprocessed, { async: false });
  let html = typeof result === "string" ? result : "";
  html = applyAlignmentMarkers(html);
  html = html.replace(/%%BR%%/g, '<br>');
  html = preserveSpacesInHtml(html);
  return html.replace(UNSHIELD_RE, (c) => UNSHIELD_MAP[c] ?? c);
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

/**
 * Post-process HTML to preserve spaces by converting them to non-breaking spaces.
 * HTML rendering collapses multiple consecutive spaces into a single space.
 * This function walks all text nodes and converts:
 * - Leading spaces (at the start of a text node) to NBSP
 * - Sequences of 2+ consecutive spaces to NBSP
 */
function preserveSpacesInHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    let text = node.textContent || '';
    // Convert leading spaces to NBSP
    text = text.replace(/^ +/, spaces => ' '.repeat(spaces.length));
    // Convert sequences of 2+ spaces to NBSP
    text = text.replace(/ {2,}/g, spaces => ' '.repeat(spaces.length));
    node.textContent = text;
  }

  return body.innerHTML;
}
