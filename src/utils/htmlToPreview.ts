import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
} from "../types/lineStartSymbol";

type HeadingKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
const HEADING_KEYS: HeadingKey[] = ["h1", "h2", "h3", "h4", "h5", "h6"];
const TAG_TO_KEY: Record<string, HeadingKey> = {
  h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6",
};

export function applyOptionsToHtml(html: string, options: DocxOptions): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  const counters: Record<HeadingKey, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();
    const key = TAG_TO_KEY[tag];

    if (key) {
      const headingOpts = options[key];
      const symbol = headingOpts.lineStartSymbol;
      const leadingSpaces = "leadingSpaces" in headingOpts ? " ".repeat(headingOpts.leadingSpaces) : "";

      if (isCounterSymbol(symbol)) {
        counters[key]++;
        const prefix = `${leadingSpaces}${resolveCounter(symbol, counters[key])} `;
        prependText(el, prefix);
      } else {
        const prefix = `${leadingSpaces}${getSymbolDisplay(symbol)} `;
        prependText(el, prefix);
      }
    }

    // 박스 테두리 변환: span[data-border] → 부모 요소에 data-border 이동
    transformBoxBorders(el);
  }

  return body.innerHTML;
}

/**
 * 요소 내부의 <span data-border="solid|dashed"> 를 찾아
 * 부모 블록 요소에 data-border 속성을 부여하고 span 태그를 제거합니다.
 */
function transformBoxBorders(container: Element) {
  const spans = container.querySelectorAll("span[data-border]");
  for (const span of spans) {
    const borderType = span.getAttribute("data-border");
    if (!borderType) continue;

    // span의 내용을 span 자리에 그대로 두고 태그만 제거
    const parent = span.parentNode;
    if (!parent) continue;

    // 부모 블록 요소(p, div 등)에 data-border 부여
    const blockParent = span.closest("p, div, h1, h2, h3, h4, h5, h6");
    if (blockParent && !blockParent.hasAttribute("data-border")) {
      blockParent.setAttribute("data-border", borderType);
    }

    // span 언래핑 — 내용만 남기고 span 제거
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }
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
