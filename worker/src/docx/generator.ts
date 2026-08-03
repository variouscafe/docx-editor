/**
 * BE DOCX 생성기 — ProseMirror JSONContent 를 소비해 docx 를 만든다.
 * DOM/DOMParser/window 전면 배제(Cloudflare Worker 안전).
 * src/utils/docxGenerator.ts(DOM 기반) 의 출력과 동등하도록 포팅.
 */
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
} from 'docx';
import { resolveSpacing, normalizeOptions, type DocxOptions, type SpacingFields } from '@shared/options';
import { isBoldSymbol } from '@shared/lineStartSymbol';
import { type HeadingKey } from '@shared/symbols';
import { type JSONContent, type RunData } from '@shared/runs';

type Mark = { type: string; attrs?: Record<string, any> };

interface RunBase {
  font: string;
  size: number;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
  shading?: ReturnType<typeof getShading>;
}

const HL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
  start: AlignmentType.START,
  end: AlignmentType.END,
  both: AlignmentType.BOTH,
};

export async function generateDocx(content: JSONContent, raw: DocxOptions): Promise<Blob> {
  // 구 스냅샷(필드 누락·구 H4 single/second) 보정 → 현 모델로 정규화.
  const options = normalizeOptions(raw);
  const font = options.common.fontFamily.split(',')[0].trim().replace(/'/g, '');
  const commonSize = options.common.fontSize * 2;
  const children: (Paragraph | Table)[] = [];

  for (const node of content.content ?? []) {
    switch (node.type) {
      case 'title':
        children.push(buildTitleParagraph(node, options, font));
        break;
      case 'heading':
        children.push(
          buildHeadingParagraph(node, (node.attrs?.level ?? 1) as number, options, font, commonSize)
        );
        break;
      case 'paragraph': {
        const runs = buildRuns(node.content ?? []);
        if (runs.some((r) => r.coreSummary)) {
          children.push(createCoreSummaryTable(runs, font, commonSize));
        } else {
          children.push(buildParagraph(runs, options, font, commonSize, node));
          children.push(...createAnnotationParagraphs(runs, options, font));
        }
        break;
      }
      case 'table':
        children.push(buildTable(node, font, commonSize));
        break;
      default: {
        // bulletList / orderedList / unknown → 인라인 평탄화해 단일 문단.
        const runs = buildRuns(collectInline(node));
        const trs = runsToTextRuns(runs, { font, size: commonSize, color: '000000' });
        children.push(
          new Paragraph({
            spacing: buildSpacing(options.common),
            alignment: getAlignment(node),
            children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })],
          })
        );
        break;
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font, color: '000000', size: commonSize } },
        heading1: { run: { font, color: '000000', size: options.h1.fontSize * 2 } },
        heading2: { run: { font, color: '000000', size: commonSize } },
        heading3: { run: { font, color: '000000', size: commonSize } },
        heading4: { run: { font, color: '000000', size: commonSize } },
        heading5: { run: { font, color: '000000', size: commonSize } },
        heading6: { run: { font, color: '000000', size: commonSize } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: (options.common.marginTop / 2.54) * 1440,
              right: (options.common.marginRight / 2.54) * 1440,
              bottom: (options.common.marginBottom / 2.54) * 1440,
              left: (options.common.marginLeft / 2.54) * 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** JSONContent 인라인 노드 → RunData. marks 를 속성으로 변환. */
function buildRuns(inlineNodes: JSONContent[]): RunData[] {
  const runs: RunData[] = [];
  for (const node of inlineNodes) {
    if (node.type === 'text') {
      const text = node.text ?? '';
      if (text === '') continue;
      const run: RunData = { text };
      for (const mark of (node.marks ?? []) as Mark[]) applyMark(run, mark);
      runs.push(run);
    } else if (node.type === 'hardBreak') {
      runs.push({ text: '', break: true });
    } else if (node.content?.length) {
      runs.push(...buildRuns(node.content));
    }
  }
  return runs;
}

function applyMark(run: RunData, mark: Mark): void {
  switch (mark.type) {
    case 'bold':
      run.bold = true;
      break;
    case 'italic':
      run.italics = true;
      break;
    case 'underline':
      run.underline = true;
      break;
    case 'highlight':
      run.highlight = mark.attrs?.color || '#fef08a';
      break;
    case 'boxBorder': {
      const b = mark.attrs?.['data-border'];
      if (b === 'solid') run.border = { style: 'solid', color: '333333' };
      else if (b === 'dashed') run.border = { style: 'dashed', color: '666666' };
      break;
    }
    case 'annotation':
      run.annotation = mark.attrs?.['data-annotation'];
      break;
    case 'coreSummary':
      run.coreSummary = true;
      break;
    case 'fontSize':
      run.fontSize = mark.attrs?.fontSize;
      break;
  }
}

/** 노드 트리에서 text/hardBreak 인라인을 모두 수집(리스트/미지원 평탄화용). */
function collectInline(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  for (const child of node.content ?? []) {
    if (child.type === 'text' || child.type === 'hardBreak') out.push(child);
    else if (child.content?.length) collectInline(child, out);
  }
  return out;
}

function getAlignment(node: JSONContent) {
  const align = node.attrs?.textAlign as string | undefined;
  if (!align) return undefined;
  return ALIGN[align.toLowerCase()] ?? undefined;
}

function getShading(r: RunData) {
  if (!r.highlight) return undefined;
  return { type: ShadingType.SOLID, color: 'auto', fill: r.highlight.replace('#', '').toUpperCase() };
}

function runsToTextRuns(runs: RunData[], base: RunBase): TextRun[] {
  return runs.map((r) => {
    if (r.break) return new TextRun({ break: 1, font: base.font, size: base.size });
    return new TextRun({
      text: r.text,
      bold: base.bold || r.bold,
      italics: base.italics || r.italics,
      underline: base.underline || r.underline ? {} : undefined,
      font: base.font,
      // fontSize mark 가 run 단위 크기 오버라이드.
      size: r.fontSize ? r.fontSize * 2 : base.size,
      color: base.color || '000000',
      shading: r.highlight ? getShading(r) : base.shading,
    });
  });
}

/** runs 중 border 가 있으면 Paragraph 레벨 border 로 승격. */
function buildParagraphBorder(runs: RunData[]) {
  const b = runs.find((r) => r.border)?.border;
  if (!b) return undefined;
  const style = b.style === 'solid' ? BorderStyle.SINGLE : BorderStyle.DASHED;
  return {
    top: { style, size: 1, color: b.color },
    bottom: { style, size: 1, color: b.color },
    left: { style, size: 1, color: b.color },
    right: { style, size: 1, color: b.color },
  };
}

function buildTitleParagraph(node: JSONContent, options: DocxOptions, font: string): Paragraph {
  const runs = buildRuns(node.content ?? []);
  return new Paragraph({
    spacing: buildSpacing(options.title),
    alignment: AlignmentType.CENTER,
    children: runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: options.title.bold,
          underline: options.title.underline ? {} : undefined,
          size: options.title.fontSize * 2,
          font,
          color: '000000',
        })
    ),
  });
}

/** 섹션 간격 → docx ISpacingProperties(before/after=twips, line/lineRule). */
function buildSpacing(s: SpacingFields) {
  return resolveSpacing(s).docx;
}

/** h1~h6 공통 헤딩 빌더. prefix(공백+기호/【】)는 콘텐츠의 실제 텍스트(headingPrefix mark)라
 *  runs 에 이미 포함 → 그대로 렌더. 굵은 기호면 본문까지 굵게. */
function buildHeadingParagraph(
  node: JSONContent,
  level: number,
  options: DocxOptions,
  font: string,
  commonSize: number
): Paragraph {
  const key = (`h${level}` as HeadingKey);
  const headingOpts = options[key];
  const symbol = headingOpts.lineStartSymbol;
  const runs = buildRuns(node.content ?? []);
  const alignment = getAlignment(node);
  const border = buildParagraphBorder(runs);
  const spacing = buildSpacing(headingOpts);
  const size = level === 1 ? options.h1.fontSize * 2 : commonSize;
  const bold = level === 1 ? options.h1.bold || isBoldSymbol(symbol) : isBoldSymbol(symbol);

  return new Paragraph({
    heading: HL[level],
    spacing,
    alignment,
    border,
    children: runsToTextRuns(runs, { font, size, bold, color: '000000' }),
  });
}

function buildParagraph(
  runs: RunData[],
  options: DocxOptions,
  font: string,
  commonSize: number,
  node: JSONContent
): Paragraph {
  const children = buildAnnotationChildren(runs, font, commonSize);
  return new Paragraph({
    spacing: buildSpacing(options.common),
    alignment: getAlignment(node),
    border: buildParagraphBorder(runs),
    children,
  });
}

/** 인라인 runs → TextRun(꼬마글씨는 별도 처리). */
function buildAnnotationChildren(runs: RunData[], font: string, size: number): TextRun[] {
  const result: TextRun[] = [];
  for (const r of runs) {
    if (r.break) {
      result.push(new TextRun({ break: 1, font, size }));
    } else {
      result.push(
        new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italics,
          underline: r.underline ? {} : undefined,
          font,
          size,
          color: '000000',
          shading: getShading(r),
        })
      );
    }
  }
  return result;
}

/** 핵심요약: 1행 3열 테이블 — [ 내용 ] 형태. */
function createCoreSummaryTable(runs: RunData[], font: string, commonSize: number): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const solidBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
  const text = runs.map((r) => r.text).join('');

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.DXA },
            borders: { top: solidBorder, bottom: solidBorder, left: solidBorder, right: noBorder },
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 9400, type: WidthType.DXA },
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
            children: text
              .split('\n')
              .map((line) => new Paragraph({ children: [new TextRun({ text: line, font, size: commonSize, color: '000000' })] })),
          }),
          new TableCell({
            width: { size: 100, type: WidthType.DXA },
            borders: { top: solidBorder, bottom: solidBorder, left: noBorder, right: solidBorder },
            children: [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
}

/** 꼬마글씨: Mode 1 = TextBox frame, Mode 2 = ○ 별도 문단. */
function createAnnotationParagraphs(runs: RunData[], options: DocxOptions, font: string): Paragraph[] {
  const annotations = runs.filter((r) => r.annotation);
  if (annotations.length === 0) return [];

  if (options.annotationMode === 1) {
    return annotations.map((r) => {
      const annFont = options.annotation1.fontFamily.split(',')[0].trim().replace(/'/g, '');
      return new Paragraph({
        frame: {
          type: 'absolute',
          position: { x: 0, y: 180 },
          width: 4000,
          height: 300,
          anchor: { horizontal: 'text', vertical: 'text' },
          wrap: 'none',
        },
        children: [
          new TextRun({
            text: r.annotation,
            font: annFont,
            size: options.annotation1.fontSize * 2,
            color: options.annotation1.color.replace('#', ''),
          }),
        ],
      });
    });
  }

  return annotations.map(
    (r) =>
      new Paragraph({
        spacing: buildSpacing(options.annotation2),
        children: [
          new TextRun({
            text: `${options.annotation2.symbol} ${r.annotation}`,
            font,
            size: options.annotation2.fontSize * 2,
            color: '000000',
          }),
        ],
      })
  );
}

/** TipTap 표(table>tableRow>(tableHeader|tableCell)>paragraph) → docx Table (최소 매핑). */
function buildTable(node: JSONContent, font: string, commonSize: number): Table {
  const rows = (node.content ?? [])
    .filter((r) => r.type === 'tableRow')
    .map((row) => {
      const cells = (row.content ?? []).map((cell) => {
        const cellRuns = buildRuns(collectInline(cell));
        const trs = runsToTextRuns(cellRuns, { font, size: commonSize, color: '000000' });
        return new TableCell({
          children: [new Paragraph({ children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })] })],
        });
      });
      return new TableRow({ children: cells });
    });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}
