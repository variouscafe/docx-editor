import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
} from "../types/lineStartSymbol";

export function applyOptionsToHtml(html: string, options: DocxOptions): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  let h1Counter = 0;

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      h1Counter++;
      const prefix = resolveCounter(options.h1.lineStartSymbol, h1Counter) + " ";
      prependText(el, prefix);
    } else if (tag === "h2") {
      const spaces = " ".repeat(options.h2.leadingSpaces);
      const prefix = `${spaces}${getSymbolDisplay(options.h2.lineStartSymbol)} `;
      prependText(el, prefix);
    } else if (tag === "h3") {
      const spaces = " ".repeat(options.h3.leadingSpaces);
      const prefix = `${spaces}${getSymbolDisplay(options.h3.lineStartSymbol)} `;
      prependText(el, prefix);
    } else if (tag === "h4") {
      const spaces = " ".repeat(options.h4.leadingSpaces);
      const prefix = `${spaces}${getSymbolDisplay(options.h4.lineStartSymbol)} `;
      prependText(el, prefix);
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
