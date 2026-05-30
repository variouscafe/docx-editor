import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
  LineStartSymbol,
} from "../types/lineStartSymbol";

type HeadingKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
const HEADING_KEYS: HeadingKey[] = ["h1", "h2", "h3", "h4", "h5", "h6"];
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
      const configuredSpaces = "leadingSpaces" in headingOpts ? headingOpts.leadingSpaces : 0;
      const leadingSpaces = " ".repeat(getEffectiveLeadingSpaces(symbol, configuredSpaces));

      if (isCounterSymbol(symbol)) {
        counters[key]++;
        const prefix = `${leadingSpaces}${resolveCounter(symbol, counters[key])} `;
        prependText(el, prefix);
      } else {
        const prefix = `${leadingSpaces}${getSymbolDisplay(symbol)} `;
        prependText(el, prefix);
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
