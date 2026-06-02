/**
 * Convert HTML (with custom data attributes) back to custom markdown.
 * Reverse of markdownToHtml.ts.
 *
 * Supported HTML → Markdown mappings:
 * - <span data-border="solid">  → ++...++
 * - <span data-border="dashed"> → ~~...~~
 * - <mark data-color="#hex">     → ==...=={#hex}
 * - <u>                         → ^^...^^
 * - <span data-annotation="…">  → {{text|annotation}}
 * - <span data-core-summary>    → [text]
 * - <div data-title>            → ! text
 * - <h1>~<h6>                   → # ~ ######
 * - <strong>/<b>                → **...**
 * - <em>/<i>                    → *...*
 * - style="text-align:right"    → append  >>
 * - style="text-align:center"   → append  <>
 * - style="text-align:left"     → append  <<
 */

const DEFAULT_HIGHLIGHT_COLOR = "#fef08a";

/**
 * Extract text-align value from a style attribute string.
 */
function extractAlign(style: string | null): string | null {
  if (!style) return null;
  const m = style.match(/text-align:\s*(left|center|right)/);
  return m ? m[1] : null;
}

/**
 * Get alignment marker for end of line.
 */
function alignMarker(align: string | null): string {
  if (!align) return "";
  if (align === "right") return " >>";
  if (align === "center") return " <>";
  if (align === "left") return " <<";
  return "";
}

/**
 * Recursively walk a DOM node and produce markdown text.
 */
function walk(node: Node, indent: number = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Title: <div data-title="true">
  if (tag === "div" && el.getAttribute("data-title")) {
    const inner = collectInline(el);
    return "! " + inner + "\n\n";
  }

  // Headings
  const headingMatch = tag.match(/^h([1-6])$/);
  if (headingMatch) {
    const level = parseInt(headingMatch[1]);
    const prefix = "#".repeat(level) + " ";
    const inner = collectInline(el);
    const align = extractAlign(el.getAttribute("style"));
    return prefix + inner + alignMarker(align) + "\n\n";
  }

  // Paragraphs
  if (tag === "p") {
    const inner = collectInline(el);
    if (!inner.trim()) return "\n";
    const align = extractAlign(el.getAttribute("style"));
    return inner + alignMarker(align) + "\n\n";
  }

  // Unordered list
  if (tag === "ul") {
    let result = "";
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() === "li") {
        result += "- " + collectInline(child).trim() + "\n";
      }
    }
    return result + "\n";
  }

  // Ordered list
  if (tag === "ol") {
    let result = "";
    let i = 1;
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() === "li") {
        result += i + ". " + collectInline(child).trim() + "\n";
        i++;
      }
    }
    return result + "\n";
  }

  // Line breaks
  if (tag === "br") {
    return "\n";
  }

  // For other block elements, just recurse
  if (isBlockElement(tag)) {
    let result = "";
    for (const child of Array.from(el.childNodes)) {
      result += walk(child, indent);
    }
    return result;
  }

  // Fallback for unknown inline elements
  return collectInline(el);
}

/**
 * Collect inline content from an element, handling marks (bold, italic, etc.).
 */
function collectInline(el: Element): string {
  let result = "";
  for (const child of Array.from(el.childNodes)) {
    result += walkInline(child);
  }
  return result;
}

/**
 * Walk an inline node and produce markdown with mark wrappers.
 */
function walkInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = collectInline(el);

  // <br>
  if (tag === "br") return "\n";

  // Bold: <strong>, <b>
  if (tag === "strong" || tag === "b") {
    return "**" + inner + "**";
  }

  // Italic: <em>, <i>
  if (tag === "em" || tag === "i") {
    return "*" + inner + "*";
  }

  // Underline: <u>
  if (tag === "u") {
    return "^^" + inner + "^^";
  }

  // Solid box: <span data-border="solid">
  if (tag === "span" && el.getAttribute("data-border") === "solid") {
    return "++" + inner + "++";
  }

  // Dashed box: <span data-border="dashed">
  if (tag === "span" && el.getAttribute("data-border") === "dashed") {
    return "~~" + inner + "~~";
  }

  // Highlight: <mark data-color="...">
  if (tag === "mark") {
    const color = el.getAttribute("data-color") || DEFAULT_HIGHLIGHT_COLOR;
    if (color === DEFAULT_HIGHLIGHT_COLOR) {
      return "==" + inner + "==";
    }
    return "==" + inner + "==" + "{" + color + "}";
  }

  // Annotation: <span data-annotation="...">
  const annotation = el.getAttribute("data-annotation");
  if (tag === "span" && annotation) {
    return "{{" + inner + "|" + annotation + "}}";
  }

  // Core summary: <span data-core-summary>
  if (tag === "span" && el.getAttribute("data-core-summary")) {
    return "[" + inner + "]";
  }

  // Generic <span> or other inline — just return inner content
  return inner;
}

function isBlockElement(tag: string): boolean {
  return ["div", "section", "article", "main", "blockquote"].includes(tag);
}

/**
 * Convert HTML string to custom markdown.
 * Uses DOMParser (browser API) to parse HTML and walk the DOM tree.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  let result = "";
  for (const child of Array.from(body.childNodes)) {
    result += walk(child);
  }

  // Clean up excessive newlines (max 2 consecutive)
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim() + "\n";
}
