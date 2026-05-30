import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
} from "../types/lineStartSymbol";
import type { LineStartSymbol } from "../types/lineStartSymbol";

/** DASH 기호가 사용되면 항상 4칸 선행 공백을 강제하는 규칙 */
function getEffectiveLeadingSpaces(
  symbol: LineStartSymbol,
  configuredSpaces: number
): number {
  if (symbol === LineStartSymbol.DASH) return 4;
  return configuredSpaces;
}

export async function exportToDocx(
  html: string,
  options: DocxOptions,
  filename = "document.docx"
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  const children: Paragraph[] = [];
  const counters: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();
    const runs = buildTextRuns(el);
    const font = options.common.fontFamily.split(",")[0].trim().replace(/'/g, "");

    if (tag === "h1") {
      counters.h1++;
      const symbolText = `${resolveCounter(options.h1.lineStartSymbol, counters.h1)} `;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: options.h1.paragraphSpacing * 20 },
          children: [
            new TextRun({
              text: symbolText,
              size: options.h1.fontSize * 2,
              bold: options.h1.bold,
              font,
            }),
            ...runs.map((r) =>
              new TextRun({
                text: r.text,
                bold: options.h1.bold,
                size: options.h1.fontSize * 2,
                font,
                italics: r.italics,
                underline: r.underline ? {} : undefined,
                border: r.border,
              })
            ),
          ],
        })
      );
    } else if (tag === "h2") {
      const symbol: LineStartSymbol = options.h2.lineStartSymbol;
      const symbolText = isCounterSymbol(symbol)
        ? `${resolveCounter(symbol, ++counters.h2)}`
        : getSymbolDisplay(symbol);
      const prefix =
        " ".repeat(getEffectiveLeadingSpaces(options.h2.lineStartSymbol, options.h2.leadingSpaces)) + `${symbolText} `;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { after: options.h2.paragraphSpacing * 20 },
          children: [
            new TextRun({ text: prefix, font }),
            ...runs.map((r) =>
              new TextRun({
                text: r.text,
                bold: r.bold,
                italics: r.italics,
                underline: r.underline ? {} : undefined,
                border: r.border,
                font,
              })
            ),
          ],
        })
      );
    } else if (tag === "h3") {
      const symbol: LineStartSymbol = options.h3.lineStartSymbol;
      const symbolText = isCounterSymbol(symbol)
        ? `${resolveCounter(symbol, ++counters.h3)}`
        : getSymbolDisplay(symbol);
      const prefix =
        " ".repeat(getEffectiveLeadingSpaces(options.h3.lineStartSymbol, options.h3.leadingSpaces)) + `${symbolText} `;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { after: options.common.paragraphSpacing * 20 },
          children: [
            new TextRun({ text: prefix, font }),
            ...runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italics,
                  underline: r.underline ? {} : undefined,
                  border: r.border,
                  font,
                })
            ),
          ],
        })
      );
    } else if (tag === "h4") {
      const symbol: LineStartSymbol = options.h4.lineStartSymbol;
      const symbolText = isCounterSymbol(symbol)
        ? `${resolveCounter(symbol, ++counters.h4)}`
        : getSymbolDisplay(symbol);
      const prefix =
        " ".repeat(getEffectiveLeadingSpaces(options.h4.lineStartSymbol, options.h4.leadingSpaces)) + `${symbolText} `;
      const textContent = el.textContent || "";
      const isSingleLine = !textContent.includes("\n");
      const spacing = isSingleLine
        ? options.h4.singleLineSpacing
        : options.h4.secondLineSpacing;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          spacing: { after: spacing * 20 },
          children: [
            new TextRun({ text: prefix, font }),
            ...runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italics,
                  underline: r.underline ? {} : undefined,
                  border: r.border,
                  font,
                })
            ),
          ],
        })
      );
    } else if (tag === "h5") {
      const symbol: LineStartSymbol = options.h5.lineStartSymbol;
      const symbolText = isCounterSymbol(symbol)
        ? `${resolveCounter(symbol, ++counters.h5)}`
        : getSymbolDisplay(symbol);
      const prefix =
        " ".repeat(getEffectiveLeadingSpaces(options.h5.lineStartSymbol, options.h5.leadingSpaces)) + `${symbolText} `;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_5,
          spacing: { after: options.common.paragraphSpacing * 20 },
          children: [
            new TextRun({ text: prefix, font }),
            ...runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italics,
                  underline: r.underline ? {} : undefined,
                  border: r.border,
                  font,
                })
            ),
          ],
        })
      );
    } else if (tag === "h6") {
      const symbol: LineStartSymbol = options.h6.lineStartSymbol;
      const symbolText = isCounterSymbol(symbol)
        ? `${resolveCounter(symbol, ++counters.h6)}`
        : getSymbolDisplay(symbol);
      const prefix =
        " ".repeat(getEffectiveLeadingSpaces(options.h6.lineStartSymbol, options.h6.leadingSpaces)) + `${symbolText} `;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_6,
          spacing: { after: options.common.paragraphSpacing * 20 },
          children: [
            new TextRun({ text: prefix, font }),
            ...runs.map(
              (r) =>
                new TextRun({
                  text: r.text,
                  bold: r.bold,
                  italics: r.italics,
                  underline: r.underline ? {} : undefined,
                  border: r.border,
                  font,
                })
            ),
          ],
        })
      );
    } else if (tag === "p") {
      // TextRun 중 border가 있으면 Paragraph 레벨로 승격
      const borderRun = runs.find((r) => r.border);
      const paragraphBorder = borderRun?.border
        ? {
            top: { style: borderRun.border!.style, size: 1, color: borderRun.border!.color },
            bottom: { style: borderRun.border!.style, size: 1, color: borderRun.border!.color },
            left: { style: borderRun.border!.style, size: 1, color: borderRun.border!.color },
            right: { style: borderRun.border!.style, size: 1, color: borderRun.border!.color },
          }
        : undefined;
      children.push(
        new Paragraph({
          spacing: { after: options.common.paragraphSpacing * 20 },
          border: paragraphBorder,
          children: runs.map(
            (r) =>
              new TextRun({
                text: r.text,
                bold: r.bold,
                italics: r.italics,
                underline: r.underline ? {} : undefined,
                font,
              })
          ),
        })
      );
    } else {
      const textRuns = runs.map(
        (r) =>
          new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italics,
            underline: r.underline ? {} : undefined,
            font,
          })
      );
      children.push(
        new Paragraph({
          spacing: { after: options.common.paragraphSpacing * 20 },
          children: textRuns.length > 0 ? textRuns : [new TextRun({ text: "", font })],
        })
      );
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1418, right: 1418, bottom: 1418, left: 1418 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  saveAs(blob, filename);
}

interface RunData {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  border?: { style: typeof BorderStyle.SINGLE | typeof BorderStyle.DASHED; color: string };
}

function buildTextRuns(el: Element): RunData[] {
  const runs: RunData[] = [];

  function walk(node: Node, styles: Partial<RunData> = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        runs.push({
          text: node.textContent,
          ...styles,
        } as RunData);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const htmlEl = node as HTMLElement;
    const newStyles = { ...styles };

    const tag = htmlEl.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") newStyles.bold = true;
    if (tag === "em" || tag === "i") newStyles.italics = true;
    if (tag === "u") newStyles.underline = true;

    const border = htmlEl.getAttribute("data-border");
    if (border === "solid") {
      newStyles.border = { style: BorderStyle.SINGLE, color: "333333" };
    } else if (border === "dashed") {
      newStyles.border = { style: BorderStyle.DASHED, color: "666666" };
    }

    for (const child of Array.from(htmlEl.childNodes)) {
      walk(child, newStyles);
    }
  }

  walk(el);
  return runs;
}

