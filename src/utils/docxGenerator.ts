import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";
import type { DocxOptions } from "../types/options";
import {
  resolveCounter,
  getSymbolDisplay,
  isCounterSymbol,
  isContentBracket,
  isBoldSymbol,
} from "../types/lineStartSymbol";
import { LineStartSymbol } from "../types/lineStartSymbol";

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
 * <br> to \n so that line breaks are preserved in content bracket wrapping.
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

/** Build TextRun objects from RunData[], handling break runs */
function runsToTextRuns(
  runs: RunData[],
  baseOpts: { font: string; size: number; bold?: boolean; color?: string; italics?: boolean; underline?: {} | undefined; shading?: ReturnType<typeof getShading> }
): TextRun[] {
  return runs.map(r => {
    if (r.break) {
      return new TextRun({ break: 1, font: baseOpts.font, size: baseOpts.size });
    }
    return new TextRun({
      text: r.text,
      bold: baseOpts.bold || r.bold,
      italics: baseOpts.italics || r.italics,
      underline: baseOpts.underline ? {} : r.underline ? {} : undefined,
      font: baseOpts.font,
      size: baseOpts.size,
      color: baseOpts.color || "000000",
      shading: r.highlight ? getShading(r) : baseOpts.shading,
    });
  });
}

/** HTML 요소에서 text-align 추출 → docx AlignmentType 매핑 */
function getAlignment(el: Element): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
  // Check the element itself first
  const htmlEl = el as HTMLElement;
  let align = htmlEl.style?.textAlign || htmlEl.getAttribute("align");

  // Also check nested <div style="text-align: ..."> children
  if (!align) {
    const innerDiv = el.querySelector("[style*='text-align']");
    if (innerDiv) {
      align = (innerDiv as HTMLElement).style?.textAlign;
    }
  }

  if (!align) return undefined;
  const map: Record<string, typeof AlignmentType[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    start: AlignmentType.START,
    end: AlignmentType.END,
    both: AlignmentType.BOTH,
  };
  return map[align.toLowerCase()] ?? undefined;
}

/** runs 중 border가 있으면 Paragraph 레벨 border로 승격 */
function buildParagraphBorder(runs: RunData[]) {
  const borderRun = runs.find((r) => r.border);
  if (!borderRun?.border) return undefined;
  return {
    top: { style: borderRun.border.style, size: 1, color: borderRun.border.color },
    bottom: { style: borderRun.border.style, size: 1, color: borderRun.border.color },
    left: { style: borderRun.border.style, size: 1, color: borderRun.border.color },
    right: { style: borderRun.border.style, size: 1, color: borderRun.border.color },
  };
}

export async function exportToDocx(
  html: string,
  options: DocxOptions,
  filename = "document.docx"
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  const children: (Paragraph | Table)[] = [];
  const counters: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

  const font = options.common.fontFamily.split(",")[0].trim().replace(/'/g, "");
  const commonSize = options.common.fontSize * 2;

  /** Build annotation children: Mode 1 — plain text (TextBox frame added separately), Mode 2 — normal */
  function buildAnnotationChildren(runs: RunData[], parentFont: string, parentSize: number): TextRun[] {
    const result: TextRun[] = [];

    // Both modes: render main text normally (annotation handled separately)
    for (const r of runs) {
      if (r.break) {
        result.push(new TextRun({ break: 1, font: parentFont, size: parentSize }));
      } else {
        result.push(new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italics,
          underline: r.underline ? {} : undefined,
          font: parentFont,
          size: parentSize,
          color: "000000",
          shading: getShading(r),
        }));
      }
    }
    return result;
  }

  /** 핵심요약: 1행 3열 테이블 생성 — [ 내용 ] 형태 */
  function createCoreSummaryTable(text: string): Table {
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const solidBorder = { style: BorderStyle.SINGLE, size: 1, color: "000000" };

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            // 왼쪽 셀: 좁음, [ 역할
            new TableCell({
              width: { size: 100, type: WidthType.DXA },
              borders: {
                top: solidBorder,
                bottom: solidBorder,
                left: solidBorder,
                right: noBorder,
              },
              children: [new Paragraph({ children: [] })],
            }),
            // 가운데 셀: 내용, 모든 테두리 투명
            new TableCell({
              width: { size: 9400, type: WidthType.DXA },
              borders: {
                top: noBorder,
                bottom: noBorder,
                left: noBorder,
                right: noBorder,
              },
              children: text.split("\n").map(
                (line) =>
                  new Paragraph({
                    children: [
                      new TextRun({ text: line, font, size: commonSize, color: "000000" }),
                    ],
                  })
              ),
            }),
            // 오른쪽 셀: 좁음, ] 역할
            new TableCell({
              width: { size: 100, type: WidthType.DXA },
              borders: {
                top: solidBorder,
                bottom: solidBorder,
                left: noBorder,
                right: solidBorder,
              },
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    });
  }

  /** Create annotation paragraphs: Mode 1 = TextBox frame, Mode 2 = separate paragraph */
  function createAnnotationParagraphs(runs: RunData[]): Paragraph[] {
    const annotations = runs.filter(r => r.annotation);
    if (annotations.length === 0) return [];

    if (options.annotationMode === 1) {
      // Mode 1: floating TextBox frame positioned below the text
      return annotations.map(r => {
        const annFont = options.annotation1.fontFamily.split(",")[0].trim().replace(/'/g, "");
        return new Paragraph({
          frame: {
            type: "absolute",
            position: { x: 0, y: 180 }, // below the text line (twips)
            width: 4000,
            height: 300,
            anchor: { horizontal: "text", vertical: "text" },
            wrap: "none",
          },
          children: [
            new TextRun({
              text: r.annotation,
              font: annFont,
              size: options.annotation1.fontSize * 2,
              color: options.annotation1.color.replace("#", ""),
            }),
          ],
        });
      });
    }

    // Mode 2: separate paragraph with ○ symbol
    return annotations.map(r =>
      new Paragraph({
        spacing: { after: options.annotation2.paragraphSpacing * 20 },
        children: [
          new TextRun({
            text: `${options.annotation2.symbol} ${r.annotation}`,
            font: font,
            size: options.annotation2.fontSize * 2,
            color: "000000",
          }),
        ],
      })
    );
  }

  for (const el of Array.from(body.children)) {
    const tag = el.tagName.toLowerCase();
    const runs = buildTextRuns(el);
    const alignment = getAlignment(el);

    // 제목: div[data-title] — 20pt, 굵게, 밑줄, 가운데 정렬
    if (tag === "div" && el.getAttribute("data-title") === "true") {
      children.push(
        new Paragraph({
          spacing: { after: options.title.paragraphSpacing * 20 },
          alignment: AlignmentType.CENTER,
          children: runs.map((r) =>
            new TextRun({
              text: r.text,
              bold: options.title.bold,
              underline: options.title.underline ? {} : undefined,
              size: options.title.fontSize * 2,
              font,
              color: "000000",
            })
          ),
        })
      );
    } else if (tag === "h1") {
      counters.h1++;
      if (isContentBracket(options.h1.lineStartSymbol)) {
        const textContent = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: options.h1.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textContent}】`,
                size: options.h1.fontSize * 2,
                bold: options.h1.bold,
                font,
                color: "000000",
              }),
            ],
          })
        );
      } else {
        const symbolText = `${resolveCounter(options.h1.lineStartSymbol, counters.h1)} `;
        const h1Bold = options.h1.bold || isBoldSymbol(options.h1.lineStartSymbol);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: options.h1.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: symbolText,
                size: options.h1.fontSize * 2,
                bold: h1Bold,
                font,
                color: "000000",
              }),
              ...runsToTextRuns(runs, { font, size: options.h1.fontSize * 2, bold: h1Bold, color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "h2") {
      const symbol: LineStartSymbol = options.h2.lineStartSymbol;
      if (isContentBracket(symbol)) {
        const textContent = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { after: options.h2.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textContent}】`,
                font,
                color: "000000",
                size: commonSize,
              }),
            ],
          })
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? `${resolveCounter(symbol, ++counters.h2)}`
          : getSymbolDisplay(symbol);
        const prefix =
          " ".repeat(getEffectiveLeadingSpaces(options.h2.lineStartSymbol, options.h2.leadingSpaces)) + `${symbolText} `;
        const h2Bold = isBoldSymbol(symbol);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { after: options.h2.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({ text: prefix, font, color: "000000", size: commonSize, bold: h2Bold }),
              ...runsToTextRuns(runs, { font, size: commonSize, bold: h2Bold, color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "h3") {
      const symbol: LineStartSymbol = options.h3.lineStartSymbol;
      if (isContentBracket(symbol)) {
        const textContent = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textContent}】`,
                font,
                color: "000000",
                size: commonSize,
              }),
            ],
          })
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? `${resolveCounter(symbol, ++counters.h3)}`
          : getSymbolDisplay(symbol);
        const prefix =
          " ".repeat(getEffectiveLeadingSpaces(options.h3.lineStartSymbol, options.h3.leadingSpaces)) + `${symbolText} `;
        const h3Bold = isBoldSymbol(symbol);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({ text: prefix, font, color: "000000", size: commonSize, bold: h3Bold }),
              ...runsToTextRuns(runs, { font, size: commonSize, bold: h3Bold, color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "h4") {
      const symbol: LineStartSymbol = options.h4.lineStartSymbol;
      const textContent = el.textContent || "";
      const hasBreak = el.querySelectorAll("br").length > 0;
      const isSingleLine = !textContent.includes("\n") && !hasBreak;
      const spacing = isSingleLine
        ? options.h4.singleLineSpacing
        : options.h4.secondLineSpacing;
      if (isContentBracket(symbol)) {
        const textWithBreaks = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_4,
            spacing: { after: spacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textWithBreaks}】`,
                font,
                color: "000000",
                size: commonSize,
              }),
            ],
          })
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? `${resolveCounter(symbol, ++counters.h4)}`
          : getSymbolDisplay(symbol);
        const prefix =
          " ".repeat(getEffectiveLeadingSpaces(options.h4.lineStartSymbol, options.h4.leadingSpaces)) + `${symbolText} `;
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_4,
            spacing: { after: spacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({ text: prefix, font, color: "000000", size: commonSize, bold: isBoldSymbol(symbol) }),
              ...runsToTextRuns(runs, { font, size: commonSize, bold: isBoldSymbol(symbol), color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "h5") {
      const symbol: LineStartSymbol = options.h5.lineStartSymbol;
      if (isContentBracket(symbol)) {
        const textContent = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_5,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textContent}】`,
                font,
                color: "000000",
                size: commonSize,
              }),
            ],
          })
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? `${resolveCounter(symbol, ++counters.h5)}`
          : getSymbolDisplay(symbol);
        const prefix =
          " ".repeat(getEffectiveLeadingSpaces(options.h5.lineStartSymbol, options.h5.leadingSpaces)) + `${symbolText} `;
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_5,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({ text: prefix, font, color: "000000", size: commonSize, bold: isBoldSymbol(symbol) }),
              ...runsToTextRuns(runs, { font, size: commonSize, bold: isBoldSymbol(symbol), color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "h6") {
      const symbol: LineStartSymbol = options.h6.lineStartSymbol;
      if (isContentBracket(symbol)) {
        const textContent = getTextContentWithBreaks(el);
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_6,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({
                text: `【${textContent}】`,
                font,
                color: "000000",
                size: commonSize,
              }),
            ],
          })
        );
      } else {
        const symbolText = isCounterSymbol(symbol)
          ? `${resolveCounter(symbol, ++counters.h6)}`
          : getSymbolDisplay(symbol);
        const prefix =
          " ".repeat(getEffectiveLeadingSpaces(options.h6.lineStartSymbol, options.h6.leadingSpaces)) + `${symbolText} `;
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_6,
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: [
              new TextRun({ text: prefix, font, color: "000000", size: commonSize, bold: isBoldSymbol(symbol) }),
              ...runsToTextRuns(runs, { font, size: commonSize, bold: isBoldSymbol(symbol), color: "000000" }),
            ],
          })
        );
      }
    } else if (tag === "p") {
      // 핵심요약: [data-core-summary] 감지 시 3셀 테이블로 export
      const isCoreSummary = runs.some((r) => r.coreSummary);
      if (isCoreSummary) {
        const textContent = runs.map((r) => r.text).join("");
        children.push(createCoreSummaryTable(textContent));
      } else {
        const paraChildren = buildAnnotationChildren(runs, font, commonSize);
        children.push(
          new Paragraph({
            spacing: { after: options.common.paragraphSpacing * 20 },
            alignment,
            border: buildParagraphBorder(runs),
            children: paraChildren,
          })
        );
        // Add annotation paragraphs (TextBox frame for Mode 1, separate para for Mode 2)
        children.push(...createAnnotationParagraphs(runs));
      }
    } else {
      const textRuns = runs.map(
        (r) => {
          if (r.break) {
            return new TextRun({ break: 1, font, size: commonSize });
          }
          return new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italics,
            underline: r.underline ? {} : undefined,
            shading: getShading(r),
            font,
            size: commonSize,
          });
        }
      );
      children.push(
        new Paragraph({
          spacing: { after: options.common.paragraphSpacing * 20 },
          alignment,
          children: textRuns.length > 0 ? textRuns : [new TextRun({ text: "", font, size: commonSize })],
        })
      );
    }
  }

  const docxDocument = new Document({
    styles: {
      default: {
        document: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
        heading1: {
          run: {
            font,
            color: "000000",
            size: options.h1.fontSize * 2,
          },
        },
        heading2: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
        heading3: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
        heading4: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
        heading5: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
        heading6: {
          run: {
            font,
            color: "000000",
            size: commonSize,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: options.common.marginTop / 2.54 * 1440,
              right: options.common.marginRight / 2.54 * 1440,
              bottom: options.common.marginBottom / 2.54 * 1440,
              left: options.common.marginLeft / 2.54 * 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDocument);

  // Native download — no dependency on file-saver
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface RunData {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  border?: { style: typeof BorderStyle.SINGLE | typeof BorderStyle.DASHED; color: string };
  annotation?: string;
  coreSummary?: boolean;
  highlight?: string; // hex color for mark/shading
  break?: boolean; // line break within a paragraph
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
    if (tag === "br") {
      runs.push({ text: "", break: true, ...styles } as RunData);
      return;
    }
    if (tag === "strong" || tag === "b") newStyles.bold = true;
    if (tag === "em" || tag === "i") newStyles.italics = true;
    if (tag === "u") newStyles.underline = true;
    if (tag === "mark") {
      const color = htmlEl.getAttribute("data-color") || "#fef08a";
      newStyles.highlight = color;
    }

    const border = htmlEl.getAttribute("data-border");
    if (border === "solid") {
      newStyles.border = { style: BorderStyle.SINGLE, color: "333333" };
    } else if (border === "dashed") {
      newStyles.border = { style: BorderStyle.DASHED, color: "666666" };
    }

    const annotation = htmlEl.getAttribute("data-annotation");
    if (annotation) {
      newStyles.annotation = annotation;
    }

    if (htmlEl.getAttribute("data-core-summary") !== null) {
      newStyles.coreSummary = true;
    }

    for (const child of Array.from(htmlEl.childNodes)) {
      walk(child, newStyles);
    }
  }

  walk(el);
  return runs;
}

/** RunData의 highlight 속성을 docx TextRun용 shading 객체로 변환 */
function getShading(r: RunData): { type: typeof ShadingType.SOLID; color: string; fill: string } | undefined {
  if (!r.highlight) return undefined;
  return {
    type: ShadingType.SOLID,
    color: "auto",
    fill: r.highlight.replace("#", "").toUpperCase(),
  };
}
