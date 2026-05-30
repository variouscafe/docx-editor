import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
} from "../types/lineStartSymbol";
import type { LineStartSymbol } from "../types/lineStartSymbol";

export function applyOptionsToHtml(html: string, options: DocxOptions): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  const counters: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0 };

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      const headingOpts = options[tag as "h1" | "h2" | "h3" | "h4"];
      const symbol: LineStartSymbol = headingOpts.lineStartSymbol;
      const leadingSpaces = "leadingSpaces" in headingOpts ? " ".repeat(headingOpts.leadingSpaces) : "";

      if (isCounterSymbol(symbol)) {
        counters[tag]++;
        const prefix = `${leadingSpaces}${resolveCounter(symbol, counters[tag])} `;
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
