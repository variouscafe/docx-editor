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
        const text = el.textContent || "";
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(
          el.ownerDocument.createTextNode(`${leadingSpaces}【${text}】`)
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? resolveCounter(symbol, ++counters[key])
          : getSymbolDisplay(symbol);
        const bold = isBoldSymbol(symbol);
        const prefix = bold
          ? `${leadingSpaces}<strong>${symbolText}</strong> `
          : `${leadingSpaces}${symbolText} `;
        if (bold) {
          el.insertAdjacentHTML("afterbegin", prefix);
        } else {
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
