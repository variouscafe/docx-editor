import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
  isContentBracket,
  isBoldSymbol,
  LineStartSymbol,
} from "../types/lineStartSymbol";

type HeadingKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
const TAG_TO_KEY: Record<string, HeadingKey> = {
  h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6",
};

/** 기호별 선행 공백 강제 규칙: □=1칸, -=4칸, •=4칸 */
function getEffectiveLeadingSpaces(
  symbol: LineStartSymbol,
  configuredSpaces: number
): number {
  if (symbol === LineStartSymbol.SQUARE) return 1;
  if (symbol === LineStartSymbol.DASH) return 4;
  if (symbol === LineStartSymbol.BULLET) return 4;
  return configuredSpaces;
}

/**
 * Get text content from an element, preserving <br> tags as newline characters.
 * Unlike el.textContent which drops <br> entirely, this function converts
 * <br> to \n so that line breaks are not lost during content bracket wrapping.
 */
function getTextContentWithBreaks(el: Element): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase();
      if (tag === 'br') {
        text += '\n';
      } else {
        text += getTextContentWithBreaks(child as Element);
      }
    }
  }
  return text;
}

export function applyOptionsToHtml(html: string, options: DocxOptions): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  const counters: Record<HeadingKey, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

  // 꼬마글씨 Mode 2: transform inline annotations into separate paragraphs
  if (options.annotationMode === 2) {
    const annotations = body.querySelectorAll("[data-annotation]");
    const insertions: { refNode: Element; newPara: HTMLParagraphElement }[] = [];

    for (const span of Array.from(annotations)) {
      const annotationText = span.getAttribute("data-annotation") || "";
      // Find the closest parent that is a direct child of body
      const parentBlock = span.closest("p, h1, h2, h3, h4, h5, h6");
      if (!parentBlock || !parentBlock.parentElement?.isSameNode(body)) continue;

      // Create a new paragraph for the annotation
      const newPara = doc.createElement("p");
      newPara.setAttribute("data-annotation-paragraph", "true");
      newPara.textContent = `${options.annotation2.symbol} ${annotationText}`;

      // Remove the annotation attribute so CSS ::after doesn't fire
      span.removeAttribute("data-annotation");

      insertions.push({ refNode: parentBlock, newPara });
    }

    // Insert annotation paragraphs after their parent blocks (reverse to keep order)
    for (const { refNode, newPara } of insertions) {
      refNode.after(newPara);
    }
  }

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();
    const key = TAG_TO_KEY[tag];

    if (key) {
      const headingOpts = options[key];
      const symbol = headingOpts.lineStartSymbol;
      const configuredSpaces = "leadingSpaces" in headingOpts ? headingOpts.leadingSpaces : 0;
      const leadingSpaces = " ".repeat(getEffectiveLeadingSpaces(symbol, configuredSpaces));

      if (isContentBracket(symbol)) {
        const text = getTextContentWithBreaks(el);
        while (el.firstChild) el.removeChild(el.firstChild);
        // Convert \n back to <br> within the bracketed content
        const bracketContent = `${leadingSpaces}【${text}】`;
        const lines = bracketContent.split('\n');
        for (let li = 0; li < lines.length; li++) {
          if (li > 0) el.appendChild(el.ownerDocument.createElement('br'));
          el.appendChild(el.ownerDocument.createTextNode(lines[li]));
        }
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? resolveCounter(symbol, ++counters[key])
          : getSymbolDisplay(symbol);
        const bold = isBoldSymbol(symbol);
        if (bold) {
          // 기호 + 본문 모두 굵게
          el.insertAdjacentHTML("afterbegin", `${leadingSpaces}${symbolText} `);
          el.innerHTML = `<strong>${el.innerHTML}</strong>`;
        } else {
          const prefix = `${leadingSpaces}${symbolText} `;
          prependText(el, prefix);
        }
      }
    }
  }

  return body.innerHTML;
}

function prependText(el: Element, text: string) {
  if (!text) return;
  const firstChild = el.firstChild;
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    firstChild.textContent = text + (firstChild.textContent || "");
  } else {
    const textNode = el.ownerDocument.createTextNode(text);
    el.insertBefore(textNode, firstChild);
  }
}

/**
 * Reverse the transforms applied by applyOptionsToHtml.
 * Strips line-start symbols, bold wrapping, content brackets, and annotation mode 2 paragraphs
 * so that the HTML can be used as clean editorHtml again.
 */
export function stripPreviewTransforms(html: string, options: DocxOptions): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  // 1. Reverse annotation mode 2: remove annotation paragraphs
  //    (We can't restore the inline position, so we just remove them)
  if (options.annotationMode === 2) {
    const paras = body.querySelectorAll("[data-annotation-paragraph]");
    for (const p of Array.from(paras)) {
      p.remove();
    }
  }

  // 2. Strip line-start symbols from headings
  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();
    const key = TAG_TO_KEY[tag];
    if (!key) continue;

    const headingOpts = options[key];
    const symbol = headingOpts.lineStartSymbol;

    if (isContentBracket(symbol)) {
      // Reverse: 【text】 → text (preserve <br> line breaks)
      const text = getTextContentWithBreaks(el);
      const stripped = text.replace(/^[·\s]*【(.+)】$/, "$1").trim();
      while (el.firstChild) el.removeChild(el.firstChild);
      // Convert \n back to <br> within the stripped content
      const lines = stripped.split('\n');
      for (let li = 0; li < lines.length; li++) {
        if (li > 0) el.appendChild(el.ownerDocument.createElement('br'));
        el.appendChild(el.ownerDocument.createTextNode(lines[li]));
      }
    } else {
      const configuredSpaces = "leadingSpaces" in headingOpts ? headingOpts.leadingSpaces : 0;
      const leadingCount = getEffectiveLeadingSpaces(symbol, configuredSpaces);

      if (isBoldSymbol(symbol)) {
        // Reverse: unwrap <strong> first, then strip symbol prefix
        const strongs = el.querySelectorAll("strong");
        for (const s of Array.from(strongs)) {
          const parent = s.parentNode;
          if (!parent) continue;
          while (s.firstChild) parent.insertBefore(s.firstChild, s);
          parent.removeChild(s);
        }
      }

      // Strip leading NBSP + symbol text + space
      stripSymbolPrefix(el, symbol, leadingCount);
    }
  }

  return body.innerHTML;
}

/**
 * Strip the symbol prefix from a heading element.
 * Handles patterns like: "    1. " or " □ " etc.
 */
function stripSymbolPrefix(el: Element, symbol: LineStartSymbol, leadingCount: number): void {
  // Get the leading text (NBSPs + symbol + space)
  const leadingNbsp = " ".repeat(leadingCount);

  let pattern: RegExp;
  switch (symbol) {
    case LineStartSymbol.NUMBER_DOT:
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}\\d+\\.\\s*`);
      break;
    case LineStartSymbol.NUMBER_PAREN:
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}\\d+\\)\\s*`);
      break;
    case LineStartSymbol.ROMAN:
      // Unicode roman Ⅰ-Ⅻ or ASCII I, II, III, IV, etc.
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}[\\u2160-\\u216BIVX]+\\s*`);
      break;
    case LineStartSymbol.CIRCLED:
      // Unicode ①-⑳ or (n)
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}[\\u2460-\\u2473\\(\\d\\)]+\\s*`);
      break;
    case LineStartSymbol.SQUARE:
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}□\\s*`);
      break;
    case LineStartSymbol.DASH:
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}-\\s*`);
      break;
    case LineStartSymbol.BULLET:
      pattern = new RegExp(`^${escapeRegExp(leadingNbsp)}•\\s*`);
      break;
    default:
      return;
  }

  // Try to strip from the first text node
  const firstChild = el.firstChild;
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const text = firstChild.textContent || "";
    firstChild.textContent = text.replace(pattern, "");
  } else if (firstChild) {
    // Symbol might be inside the first child element
    // Try walking to find the first text node
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const firstTextNode = walker.nextNode() as Text | null;
    if (firstTextNode) {
      const text = firstTextNode.textContent || "";
      firstTextNode.textContent = text.replace(pattern, "");
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
