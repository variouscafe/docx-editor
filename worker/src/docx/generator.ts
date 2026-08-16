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
  TableLayoutType,
  ImageRun,
} from 'docx';
import { resolveSpacing, normalizeOptions, type DocxOptions, type SpacingFields } from '@shared/options';
import { isBoldSymbol } from '@shared/lineStartSymbol';
import { type HeadingKey } from '@shared/symbols';
import { type JSONContent, type RunData, getTextContentFromRuns } from '@shared/runs';
import { buildTableGrid, formatCellValue } from '@shared/tableFormula';

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

/** 로드된 이미지 — loadImage 콜백 결과(호출부가 R2/외부 fetch 를 결정). */
interface LoadedImage {
  data: ArrayBuffer | Uint8Array;
  mime: string;
  width?: number;
  height?: number;
}

export interface GenerateDocxOptions {
  /** 이미지 src → 바이너리 로더. 없으면 이미지 노드는 스킵. */
  loadImage?: (src: string) => Promise<LoadedImage | null>;
}

interface ImageContext extends GenerateDocxOptions {
  /** 호출 스코프 캐시(같은 src 중복 로드 방지). 값 null = 로드 실패도 캐시. */
  cache: Map<string, LoadedImage | null>;
}

/** docx ImageRun 이 지원하는 이미지 타입만 통과(FE 가 webp/heic 를 재인코딩해 업로드). */
const IMAGE_RUN_TYPE: Record<string, 'jpg' | 'png' | 'gif' | 'bmp'> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/** A4 본문 폭(px) — 마진 옵션 반영. 1px=15twips(96DPI) 로 미리보기 환산과 동일. */
function usableWidthPx(options: DocxOptions): number {
  const mL = (options.common.marginLeft / 2.54) * 1440;
  const mR = (options.common.marginRight / 2.54) * 1440;
  return Math.max(1, Math.floor((11906 - mL - mR) / 15));
}

/** 이미지 노드 → docx 문단들(이미지 + 캡션). 치수는 attrs → 로더 폴백 → 480×360. 축소만(비율 유지).
 *  캡션은 미리보기와 동일 스펙(9pt #595959)으로 이미지 바로 아래 문단. */
async function buildImageParagraphs(
  node: JSONContent,
  options: DocxOptions,
  ctx: ImageContext,
  maxWidthPx?: number
): Promise<Paragraph[]> {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
  // blob:(업로드 미완료)/data: 인라인은 export 대상 아님.
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return [];
  if (!ctx.loadImage) return [];
  if (!ctx.cache.has(src)) ctx.cache.set(src, await ctx.loadImage(src));
  const img = ctx.cache.get(src) ?? null;
  if (!img) return [];
  const type = IMAGE_RUN_TYPE[(img.mime || '').toLowerCase()];
  if (!type) return [];

  let w = Number(node.attrs?.width) || img.width || 0;
  let h = Number(node.attrs?.height) || img.height || 0;
  if (!(w > 0) || !(h > 0)) {
    w = 480;
    h = 360;
  }
  const maxW = maxWidthPx ?? usableWidthPx(options);
  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  // 미리보기와 동일 — 이미지·캡션 모두 가운데 정렬.
  const image = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type, data: img.data, transformation: { width: w, height: h } })],
  });
  const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption.trim() : '';
  if (!caption) return [image];
  const font = options.common.fontFamily.split(',')[0].trim().replace(/'/g, '');
  return [
    image,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: caption, font, size: 9 * 2, color: '595959' })],
    }),
  ];
}

export async function generateDocx(
  content: JSONContent,
  raw: DocxOptions,
  opts: GenerateDocxOptions = {}
): Promise<Blob> {
  // 구 스냅샷(필드 누락·구 H4 single/second) 보정 → 현 모델로 정규화.
  const options = normalizeOptions(raw);
  const font = options.common.fontFamily.split(',')[0].trim().replace(/'/g, '');
  const commonSize = options.common.fontSize * 2;
  const children: (Paragraph | Table)[] = [];
  const imgCtx: ImageContext = { ...opts, cache: new Map() };

  for (const node of content.content ?? []) {
    switch (node.type) {
      case 'title': {
        // 제목·헤딩에도 꼬마글씨 주석을 붙인다(문단만 처리하면 표/제목에서 드롭).
        const runs = buildRuns(node.content ?? []);
        children.push(buildTitleParagraph(runs, options, font));
        children.push(...createAnnotationParagraphs(runs, options, font));
        break;
      }
      case 'heading': {
        const runs = buildRuns(node.content ?? []);
        children.push(
          buildHeadingParagraph(node, (node.attrs?.level ?? 1) as number, options, font, commonSize, runs)
        );
        children.push(...createAnnotationParagraphs(runs, options, font));
        break;
      }
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
      case 'image': {
        const ps = await buildImageParagraphs(node, options, imgCtx);
        children.push(...ps);
        break;
      }
      case 'table':
        children.push(await buildTable(node, options, font, commonSize, imgCtx));
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
        // 인용문 등 미지원 블록 내 직속 이미지도 드롭하지 않고 이어서 append.
        for (const child of node.content ?? []) {
          if (child.type !== 'image') continue;
          children.push(...(await buildImageParagraphs(child, options, imgCtx)));
        }
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
  return { type: ShadingType.CLEAR, color: 'auto', fill: r.highlight.replace('#', '').toUpperCase() };
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

/** runs 중 border 가 있으면 Paragraph 레벨 border 로 승격.
 *  size 9=1.125pt(미리보기 1.5px 상당), space 8pt=미리보기 padding(12px 16px) 근사. */
function buildParagraphBorder(runs: RunData[]) {
  const b = runs.find((r) => r.border)?.border;
  if (!b) return undefined;
  const style = b.style === 'solid' ? BorderStyle.SINGLE : BorderStyle.DASHED;
  return {
    top: { style, size: 9, color: b.color, space: 8 },
    bottom: { style, size: 9, color: b.color, space: 8 },
    left: { style, size: 9, color: b.color, space: 8 },
    right: { style, size: 9, color: b.color, space: 8 },
  };
}

function buildTitleParagraph(runs: RunData[], options: DocxOptions, font: string): Paragraph {
  // runsToTextRuns 로 인라인 mark(굵게/형광펜/fontSize/hardBreak) 보존 —
  // 옵션 레벨 스타일은 base 로, run mark 가 우선 오버라이드.
  return new Paragraph({
    spacing: buildSpacing(options.title),
    // 정렬 하드코딩 폐지 — options.title.align 따름(구 옵션 방어로 기본 center).
    alignment: ALIGN[options.title.align] ?? AlignmentType.CENTER,
    children: runsToTextRuns(runs, {
      font,
      size: options.title.fontSize * 2,
      bold: options.title.bold,
      underline: options.title.underline,
      color: '000000',
    }),
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
  commonSize: number,
  runs: RunData[]
): Paragraph {
  const key = (`h${level}` as HeadingKey);
  const headingOpts = options[key];
  const symbol = headingOpts.lineStartSymbol;
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

/** 인라인 runs → TextRun(꼬마글씨는 별도 처리). fontSize mark 는 run 단위 크기 오버라이드. */
function buildAnnotationChildren(runs: RunData[], font: string, size: number): TextRun[] {
  const result: TextRun[] = [];
  for (const r of runs) {
    if (r.break) {
      result.push(new TextRun({ break: 1, font, size: r.fontSize ? r.fontSize * 2 : size }));
    } else {
      result.push(
        new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italics,
          underline: r.underline ? {} : undefined,
          font,
          size: r.fontSize ? r.fontSize * 2 : size,
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
  // hardBreak(break run) 도 개행으로 반영 — Shift+Enter 2줄 요약이 한 줄로 합쳐지지 않게.
  const text = getTextContentFromRuns(runs);

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
    return annotations.map((r, i) => {
      const annFont = options.annotation1.fontFamily.split(',')[0].trim().replace(/'/g, '');
      return new Paragraph({
        frame: {
          type: 'absolute',
          // 같은 문단 내 복수 주석이 같은 y 에 겹치지 않도록 한 줄(12pt=240twips)씩 아래로.
          position: { x: 0, y: 180 + i * 240 },
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
            // 미리보기(previewStyles #333)와 동일 색상.
            color: '333333',
          }),
        ],
      })
  );
}

/**
 * TipTap 표(table>tableRow>(tableHeader|tableCell)>paragraph) → docx Table.
 * 테두리·병합셀(colspan/rowspan)·헤더행(tableHeader)·셀음영(background)·
 * 셀 단락 정렬(textAlign)·열 너비(colwidth→twips) 매핑. 미리보기와 동일 스펙.
 *
 * 표 계산: shared 엔진(buildTableGrid/formatCellValue)로 그리드를 빌드해 format/formula 셀을
 * 미리보기와 동일하게 평가·포맷한다. 수식은 매 내보내기마다 재평가(저장 시점 무관).
 * 숫자 포맷/수식 셀은 명시적 정렬이 없으면 우측 정렬(금액 표기 관례).
 */
async function buildTable(
  node: JSONContent,
  options: DocxOptions,
  font: string,
  commonSize: number,
  imgCtx: ImageContext
): Promise<Table> {
  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '333333' }; // 4 = 0.5pt
  const tableBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
    insideHorizontal: cellBorder,
    insideVertical: cellBorder,
  };

  const rowsArr = (node.content ?? []).filter((r) => r.type === 'tableRow');
  const grid = buildTableGrid(node);

  // 열 너비: 첫 행 셀의 colwidth(px) → twips(px*15). 병합 셀이 섞이거나 값이 없으면 자동 배분에 맡김.
  let columnWidths: number[] | undefined;
  const firstRowCells = (rowsArr[0]?.content ?? []).filter(
    (c) => c.type === 'tableCell' || c.type === 'tableHeader',
  );
  const allSimple = firstRowCells.length > 0 && firstRowCells.every((c) => !c.attrs?.colspan || c.attrs.colspan <= 1);
  if (allSimple) {
    const widths = firstRowCells.map((c) => {
      const cw = c.attrs?.colwidth;
      const px = Array.isArray(cw) ? Number(cw[0]) : undefined;
      return px && px > 0 ? Math.round(px * 15) : null;
    });
    if (widths.every((w) => w !== null)) columnWidths = widths as number[];
  }

  // 문서 순서 커서 — buildTableGrid.cells 와 동일 순서로 셀을 순회하기 위함.
  let cellCursor = 0;
  const rows: TableRow[] = [];
  for (const row of rowsArr) {
    const cells = (row.content ?? []).filter((c) => c.type === 'tableCell' || c.type === 'tableHeader');
    const isHeaderRow = cells.some((c) => c.type === 'tableHeader');
    const tableCells: TableCell[] = [];
    // 셀 폭 클램프용 열 커서(병합 셀은 차지한 열 수만큼 전진).
    let colCursor = 0;
    for (const cell of cells) {
      const gc = grid.cells[cellCursor++] ?? null;
      const hasCalc = !!gc && (!!gc.formula || !!gc.format);
      const isHeader = cell.type === 'tableHeader';
      const bg = (isHeader ? '#f3f4f6' : (cell.attrs?.background as string | undefined))?.replace('#', '').toUpperCase();

      let paragraphs: Paragraph[];
      // 셀 원본 단락(계산 셀 표시텍스트 대체와 무관하게 주석 수집용으로 공통 수집).
      const childParas = (cell.content ?? []).filter((p) => p.type === 'paragraph');
      if (hasCalc && gc) {
        // 계산 셀 — shared 엔진으로 평가·포맷한 표시 텍스트 1문단. 명시 정렬 없으면 우측.
        const display = formatCellValue(gc, grid);
        const explicit = childParas[0] ? getAlignment(childParas[0]) : undefined;
        const alignment = explicit ?? ALIGN.right;
        const trs =
          display === ''
            ? []
            : runsToTextRuns([{ text: display }], { font, size: commonSize, color: '000000' });
        paragraphs = [
          new Paragraph({
            alignment,
            children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })],
          }),
        ];
      } else {
        // 일반 셀 — 셀 안 단락들을 각각 Paragraph 로(단락별 정렬 유지). 단락이 없으면 빈 단락 1개.
        const sources = childParas.length ? childParas : [null];
        paragraphs = sources.map((p) => {
          const trs = runsToTextRuns(buildRuns(collectInline(p ?? { type: 'paragraph' })), {
            font,
            size: commonSize,
            color: '000000',
          });
          return new Paragraph({
            alignment: p ? getAlignment(p) : undefined,
            children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })],
          });
        });
      }
      // 꼬마글씨 — 셀 안에서도 드롭되지 않도록 셀 단락들에서 주석 수집 후 셀 내부에 append.
      // mode1=TextBox frame, mode2=○ 문단(createAnnotationParagraphs 가 옵션대로 생성).
      const cellRuns = childParas.flatMap((p) => buildRuns(collectInline(p)));
      paragraphs.push(...createAnnotationParagraphs(cellRuns, options, font));

      const colspan = cell.attrs?.colspan;
      const rowspan = cell.attrs?.rowspan;
      // 셀 직속 블록 이미지 — 셀 폭(colwidth twips→px)에 맞춰 클램프해 셀 단락 뒤에 append.
      const cwTwips = columnWidths?.[colCursor];
      const cellMaxPx = cwTwips && cwTwips > 0 ? Math.floor(cwTwips / 15) : undefined;
      colCursor += colspan && colspan > 1 ? colspan : 1;
      for (const child of cell.content ?? []) {
        if (child.type !== 'image') continue;
        paragraphs.push(...(await buildImageParagraphs(child, options, imgCtx, cellMaxPx)));
      }

      tableCells.push(
        new TableCell({
          columnSpan: colspan && colspan > 1 ? colspan : undefined,
          rowSpan: rowspan && rowspan > 1 ? rowspan : undefined,
          shading: bg ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
          children: paragraphs,
        })
      );
    }
    rows.push(new TableRow({ tableHeader: isHeaderRow || undefined, children: tableCells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    layout: columnWidths ? TableLayoutType.FIXED : undefined,
    borders: tableBorders,
    rows,
  });
}
