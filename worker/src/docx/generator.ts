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
import { type JSONContent, type RunData } from '@shared/runs';
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
  // content-type 파라미터("; charset=…"·octet-stream 변형)까지 보고 정확 매치하면 이미지가
  // 조용히 드롭된다 — 파라미터를 떼고 소문자 정규화 후 조회.
  const type = IMAGE_RUN_TYPE[(img.mime || '').split(';')[0].trim().toLowerCase()];
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
  const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption.trim() : '';
  // 미리보기와 동일 — 이미지·캡션 모두 가운데 정렬. 문단 간격은 미리보기 figure margin
  // (4px ≒ 60twips)·캡션 margin-top(2px ≒ 30twips) 근사 — 인접 문단에 바짝 붙지 않게.
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
  const image = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: caption ? 0 : 60 },
    children: [
      new ImageRun({
        type,
        data: img.data,
        transformation: { width: w, height: h },
        // 스크린리더 접근성 — caption/alt 를 대체 텍스트로.
        altText: {
          title: caption || alt || 'image',
          description: caption || alt,
          name: caption || alt || 'image',
        },
      }),
    ],
  });
  if (!caption) return [image];
  const font = options.common.fontFamily.split(',')[0].trim().replace(/'/g, '');
  return [
    image,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: caption, font, size: 9 * 2, color: '595959' })],
    }),
  ];
}

/** 문서 트리의 이미지 src 를 병렬 프리페치해 ctx.cache 에 채운다(blob:/data: 제외). */
async function prefetchImages(node: JSONContent, ctx: ImageContext): Promise<void> {
  const srcs = new Set<string>();
  const walk = (n: JSONContent): void => {
    for (const child of n.content ?? []) {
      if (child.type === 'image') {
        const src = typeof child.attrs?.src === 'string' ? child.attrs.src : '';
        if (src && !src.startsWith('blob:') && !src.startsWith('data:')) srcs.add(src);
      }
      walk(child);
    }
  };
  walk(node);
  await Promise.all(
    [...srcs].map(async (src) => {
      if (!ctx.cache.has(src)) ctx.cache.set(src, (await ctx.loadImage?.(src)) ?? null);
    }),
  );
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
  // 이미지 병렬 프리페치 — 노드 순회 중 하나씩 순차 await 하면 죽은 외부 URL 이
  // N×8초씩 직렬로 쌓인다. 고유 src 를 먼저 병렬 로드해 이후 처리는 캐시 히트로 진행.
  if (opts.loadImage) await prefetchImages(content, imgCtx);

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
          // 미리보기([data-core-summary] display:block)처럼 마크된 run 묶음만 [ ] 테이블로
          // 분할하고, 마크 밖 텍스트는 일반 문단으로 내보낸다(문단 전체가 괄호 안으로
          // 들어가던 패리티 결함 수정). 주석은 문단 전체 runs 에서 수집.
          const alignment = getAlignment(node);
          for (const seg of segmentByCoreSummary(runs)) {
            if (seg.core) {
              children.push(createCoreSummaryTable(seg.runs, font, commonSize, alignment));
            } else if (seg.runs.length) {
              children.push(new Paragraph({
                // 같은 문단의 시각적 분할 — 앞뒤 간격 0(문단 spacing 은 양끼리 1회), 행간은 본문 따름.
                spacing: { ...buildSpacing(options.common), before: 0, after: 0 },
                alignment,
                border: buildParagraphBorder(seg.runs),
                children: buildAnnotationChildren(seg.runs, font, commonSize),
              }));
            }
          }
          children.push(...createAnnotationParagraphs(runs, options, font));
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
        // bulletList / blockquote / orderedList / unknown → 평탄화해 단일 문단.
        // 블록 경계는 개행(hardBreak run)으로 — 문단 구조가 무시돼 "줄1줄2" 로 합쳐지지 않게.
        const runs = buildRuns(collectInlineWithBreaks(node));
        const trs = runsToTextRuns(runs, { font, size: commonSize, color: '000000' });
        children.push(
          new Paragraph({
            spacing: buildSpacing(options.common),
            alignment: getAlignment(node),
            border: buildParagraphBorder(runs),
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

/** collectInline + 블록 경계 개행(hardBreak) 삽입 — 평탄화 시 하위 문단들이 구분 없이
 *  이어붙는 것("줄1줄2")을 막는다. 셀·인용·코드블록 등의 평탄화 경로에서 사용. */
function collectInlineWithBreaks(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  (node.content ?? []).forEach((child, i) => {
    const isInline = child.type === 'text' || child.type === 'hardBreak';
    if (i > 0 && !isInline) out.push({ type: 'hardBreak' });
    if (isInline) out.push(child);
    else if (child.content?.length) collectInlineWithBreaks(child, out);
  });
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
    // 제목에 box 마크가 있으면 문단 보더로 승격(본문 문단과 동일 규칙).
    border: buildParagraphBorder(runs),
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

/** runs 를 coreSummary 마크 연속 묶음으로 분할 — 마크 밖/안 텍스트 교대 세그먼트. */
function segmentByCoreSummary(runs: RunData[]): { core: boolean; runs: RunData[] }[] {
  const segments: { core: boolean; runs: RunData[] }[] = [];
  for (const r of runs) {
    const core = !!r.coreSummary;
    const last = segments[segments.length - 1];
    if (last && last.core === core) last.runs.push(r);
    else segments.push({ core, runs: [r] });
  }
  return segments;
}

/**
 * 핵심요약: 1행 3열 테이블 — [ 내용 ] 형태.
 * 인라인 mark(굵게/형광펜/fontSize 등)는 runsToTextRuns 로 보존되고 hardBreak(break run)는
 * 개행 문단으로 반영된다. 괄호선은 미리보기 2px 상당의 size 9(=1.125pt).
 */
function createCoreSummaryTable(
  runs: RunData[],
  font: string,
  commonSize: number,
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const solidBorder = { style: BorderStyle.SINGLE, size: 9, color: '000000' };
  // break run 기준 라인 분할 → 라인별 문단(빈 라인도 유지).
  const lines: RunData[][] = [[]];
  for (const r of runs) {
    if (r.break) lines.push([]);
    else lines[lines.length - 1].push(r);
  }
  const base = { font, size: commonSize, color: '000000' as const };

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
            children: lines.map(
              (line) =>
                new Paragraph({
                  alignment,
                  children: line.length
                    ? runsToTextRuns(line, base)
                    : [new TextRun({ text: '', font, size: commonSize })],
                })
            ),
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

/**
 * 주석 run 수집 — 연속 같은 주석은 1회만. 하나의 꼬마글씨 마크가 굵게/hardBreak 등으로
 * 여러 run 에 걸쳐 있어도 주석이 중복 출력(○○ 두 줄, mode1 겹침)되지 않게 한다.
 * 주석 없는 run 으로 끊긴 뒤 다시 나오는 같은 텍스트는 별도 주석으로 유지.
 */
function collectAnnotationRuns(runs: RunData[]): RunData[] {
  const out: RunData[] = [];
  let prev: string | undefined;
  for (const r of runs) {
    if (!r.annotation) {
      prev = undefined;
      continue;
    }
    if (r.annotation !== prev) out.push(r);
    prev = r.annotation;
  }
  return out;
}

/** 꼬마글씨: Mode 1 = TextBox frame, Mode 2 = ○ 별도 문단. */
function createAnnotationParagraphs(runs: RunData[], options: DocxOptions, font: string): Paragraph[] {
  const annotations = collectAnnotationRuns(runs);
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

  // 열 너비: 첫 행 셀의 colwidth(px) → twips(px*15). 병합 셀은 colwidth 배열(스팬 열별
  // 항목)을 전개해 반영 — 모든 열의 값을 알 때만 고정 레이아웃(columnWidths)을 쓴다.
  const firstRowCells = (rowsArr[0]?.content ?? []).filter(
    (c) => c.type === 'tableCell' || c.type === 'tableHeader',
  );
  const totalCols = firstRowCells.reduce(
    (n, c) => n + Math.max(1, Number(c.attrs?.colspan) || 1),
    0,
  );
  const perCol: (number | null)[] = [];
  for (const c of firstRowCells) {
    const colspan = Math.max(1, Number(c.attrs?.colspan) || 1);
    const cw = c.attrs?.colwidth;
    if (Array.isArray(cw) && cw.length === colspan && cw.every((v) => Number(v) > 0)) {
      for (const v of cw) perCol.push(Math.round(Number(v) * 15));
    } else {
      for (let i = 0; i < colspan; i++) perCol.push(null);
    }
  }
  let columnWidths: number[] | undefined;
  if (perCol.length > 0 && perCol.every((w) => w != null)) columnWidths = perCol as number[];
  // 셀 이미지 클램프 기준 폭 — 값을 모르는 열은 균등 배분(본문 폭/열 수)으로 폴백.
  // 레이아웃과 달리 항상 존재해야 셀 안 이미지가 본문 전체 폭 기준으로 풀려 셀을 넘치지 않는다.
  const equalTwips = totalCols > 0 ? Math.floor((usableWidthPx(options) * 15) / totalCols) : 0;
  const clampWidths: number[] = perCol.map((w) => (w == null ? Math.max(1, equalTwips) : w));

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
      // 셀 블록 — 문단/헤딩은 스타일 유지, 그 외 블록(인용 등)은 평탄화해 소실 방지.
      // (paragraph 만 취급하면 셀 안 헤딩이 export 에서 조용히 사라졌다 — 미리보기는 렌더함.)
      const blocks = (cell.content ?? []).filter((b) => b.type !== 'image');
      const childParas = blocks.filter((p) => p.type === 'paragraph');
      if (hasCalc && gc) {
        // 계산 셀 — shared 엔진으로 평가·포맷한 표시 텍스트 1문단. 명시 정렬 없으면 우측.
        const display = formatCellValue(gc, grid);
        const explicit = childParas[0] ? getAlignment(childParas[0]) : undefined;
        const alignment = explicit ?? ALIGN.right;
        const trs =
          display === ''
            ? []
            : runsToTextRuns([{ text: display }], {
                font,
                size: commonSize,
                bold: isHeader || undefined,
                color: '000000',
              });
        paragraphs = [
          new Paragraph({
            alignment,
            children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })],
          }),
        ];
      } else {
        // 일반 셀 — 셀 안 블록들을 각각 Paragraph 로(블록별 정렬·box 보더 유지). 블록이 없으면 빈 단락 1개.
        const sources = blocks.length ? blocks : [null];
        paragraphs = sources.map((b) => {
          // 셀 안 헤딩 — 본문 헤딩과 동일 스타일(크기·굵은기호·정렬·간격)로 렌더.
          if (b && b.type === 'heading') {
            return buildHeadingParagraph(
              b,
              (b.attrs?.level ?? 1) as number,
              options,
              font,
              commonSize,
              buildRuns(b.content ?? [])
            );
          }
          const runs = buildRuns(collectInlineWithBreaks(b ?? { type: 'paragraph' }));
          const trs = runsToTextRuns(runs, {
            font,
            size: commonSize,
            // 표 헤더 셀 텍스트는 굵게 — 미리보기 th{font-weight:600} 패리티.
            bold: isHeader || undefined,
            color: '000000',
          });
          return new Paragraph({
            alignment: b ? getAlignment(b) : undefined,
            border: buildParagraphBorder(runs),
            children: trs.length ? trs : [new TextRun({ text: '', font, size: commonSize })],
          });
        });
      }
      // 꼬마글씨 — 셀 안에서도 드롭되지 않도록 셀 블록들에서 주석 수집 후 셀 내부에 append.
      // mode1=TextBox frame, mode2=○ 문단(createAnnotationParagraphs 가 옵션대로 생성).
      const cellRuns = blocks.flatMap((p) => buildRuns(collectInline(p)));
      paragraphs.push(...createAnnotationParagraphs(cellRuns, options, font));

      const colspan = cell.attrs?.colspan;
      const rowspan = cell.attrs?.rowspan;
      // 셀 직속 블록 이미지 — 셀 폭(스팬한 열들의 clampWidths 합, twips→px)에 맞춰 클램프.
      // 병합 셀은 커버하는 열 전체 폭이 기준(첫 열 값만 쓰면 과소 클램프).
      const span = colspan && colspan > 1 ? colspan : 1;
      let cwTwips = 0;
      for (let i = 0; i < span && colCursor + i < clampWidths.length; i++) {
        cwTwips += clampWidths[colCursor + i] ?? 0;
      }
      const cellMaxPx = cwTwips > 0 ? Math.floor(cwTwips / 15) : undefined;
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
