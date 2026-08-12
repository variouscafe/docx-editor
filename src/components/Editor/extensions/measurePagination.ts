import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

/**
 * 측정 기반 A4 페이지네이션 (tiptap-pagination-plus 대체) + 표 행 단위 분할.
 *
 * 배경 — tiptap-pagination-plus 는 float 기반. float 이 전체너비로 흐를 때
 * display:table(BFC) 표가 float 을 피해 우측으로 찌그러져 "다음 페이지 표가 안 보이는"
 * 버그. CSS 트위킹(clear:both)은 빈 페이지 폭발. → float 자체를 폐지.
 *
 * 이 확장은 float 미사용. 최상위 블록 offsetHeight 실측 → 그리디 원자적 배치 →
 * 페이지 경계를 normal-flow Decoration.widget(float 아님) gap 으로 표시.
 *
 * [표 행 분할] 표(table) 노드를 행(tableRow) 단위로 분해. 행이 atomic → 페이지 경계에서
 * 행 단위로 잘림. 표는 display:contents, 각 <tr> 은 flex(getPreviewStyles) → 위젯이 행 사이에 끼임.
 *
 * [헤더 반복] 다음 페이지가 표 연속이면 makePageBreak 위젯에 헤더 행 복제 통합(본체 직전,
 * content 너비 영역). 별도 side:-1 위젯은 side 충돌로 이전 페이지에 렌더되어 사용 안 함.
 *
 * [위젯 너비] 표 밖(페이지 끝) 위젯은 음수 margin 으로 전체 너비(구분바 전체 덮음).
 * 표 내부(행 사이) 위젯은 content 너비 — 음수 margin 이 tableWrapper(overflow-x:auto) 너비를
 * 초과해 가로 스크롤을 유발하므로(insideTable).
 *
 * 장식은 비영속(Decoration.widget) → editor.getJSON()/저장/DOCX 내보내기에 영향 없음.
 */

export interface MeasurePaginationOptions {
  enabled: boolean;
  pageHeight: number;
  pageWidth: number;
  pageGap: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  contentMarginTop: number;
  contentMarginBottom: number;
  pageGapBorderColor: string;
  pageBreakBackground: string;
  footerRight: string;
  footerLeft: string;
}

export const measurePaginationKey = new PluginKey<PageState>("measurePagination");
const MEASURE_META = "measurePagination.measure";
const STYLE_ID = "rm-measure-pagination-style";

interface MeasuredBlock {
  pos: number;
  end: number;
  node: PmNode;
  marginTop: number;
  marginBottom: number;
  height: number;
  isTable: boolean;
  isHeader?: boolean;
  tableId?: number;
}

interface Page {
  blocks: MeasuredBlock[];
  used: number;
}

interface PageState {
  decorations: DecorationSet;
  footerContentHeight: number;
  signature: string;
}

interface ResolvedOpts extends MeasurePaginationOptions {
  footerContentHeight: number;
}

type OptionsGetter = () => MeasurePaginationOptions;

const rafTokens = new WeakMap<EditorView, number>();

export const MeasurePagination = Extension.create<MeasurePaginationOptions>({
  name: "measurePagination",

  addOptions() {
    return {
      enabled: true,
      pageHeight: 1123,
      pageWidth: 794,
      pageGap: 30,
      marginTop: 95,
      marginBottom: 95,
      marginLeft: 76,
      marginRight: 76,
      contentMarginTop: 10,
      contentMarginBottom: 10,
      pageGapBorderColor: "#e5e5e5",
      pageBreakBackground: "#e5e5e5",
      footerRight: "{page}",
      footerLeft: "",
    };
  },

  onCreate() {
    const view = this.editor.view;
    const getOpts: OptionsGetter = () => this.options;
    injectStyles(view.dom.ownerDocument);
    applyContainerStyles(view.dom, this.options);

    const ro = new ResizeObserver(() => scheduleMeasure(view, getOpts));
    ro.observe(view.dom);
    this.storage.resizeObserver = ro;

    const fonts = (view.dom.ownerDocument as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => scheduleMeasure(view, getOpts)).catch(() => {});

    scheduleMeasure(view, getOpts);
  },

  onDestroy() {
    const ro = this.storage.resizeObserver as ResizeObserver | undefined;
    ro?.disconnect();
    removeStyles(this.editor.view.dom.ownerDocument);
  },

  addProseMirrorPlugins() {
    const getOpts: OptionsGetter = () => this.options;
    return [
      new Plugin({
        key: measurePaginationKey,
        state: {
          init: (): PageState => ({ decorations: DecorationSet.empty, footerContentHeight: 0, signature: "" }),
          apply: (tr, old, _oldState, newState) => {
            const meta = tr.getMeta(MEASURE_META) as PageState | undefined;
            if (meta) return meta;
            if (tr.docChanged) {
              return {
                decorations: old.decorations.map(tr.mapping, tr.doc),
                footerContentHeight: old.footerContentHeight,
                signature: "",
              };
            }
            return old;
          },
        },
        props: {
          decorations: (state) => measurePaginationKey.getState(state)?.decorations,
        },
        view: () => ({
          update: (view: EditorView) => scheduleMeasure(view, getOpts),
        }),
      }),
    ];
  },
});

function scheduleMeasure(view: EditorView, getOpts: OptionsGetter): void {
  const existing = rafTokens.get(view);
  if (existing !== undefined) cancelAnimationFrame(existing);
  const token = requestAnimationFrame(() => {
    rafTokens.delete(view);
    runMeasure(view, getOpts);
  });
  rafTokens.set(view, token);
}

function runMeasure(view: EditorView, getOpts: OptionsGetter): void {
  if (!(view as { docView?: unknown }).docView) return;
  const opts = getOpts();
  if (!opts.enabled) return;

  const prev = measurePaginationKey.getState(view.state) ?? {
    decorations: DecorationSet.empty,
    footerContentHeight: 0,
    signature: "",
  };

  applyColumnWidths(view);
  const blocks = measureBlocks(view);
  const measuredFooter = measureFooterContentHeight(view);
  const footerContentHeight = measuredFooter || prev.footerContentHeight || 18;

  const headerZone = opts.marginTop + opts.contentMarginTop;
  const footerZone = opts.contentMarginBottom + opts.marginBottom + footerContentHeight;
  const pageContentAreaHeight = Math.max(1, opts.pageHeight - headerZone - footerZone);

  const pages = paginate(blocks, pageContentAreaHeight);
  const decos = buildDecorations(view, pages, blocks, { ...opts, footerContentHeight });
  const newSet = DecorationSet.create(view.state.doc, decos);

  const signature = JSON.stringify({
    footer: footerContentHeight,
    pages: pages.map((p) => ({
      end: p.blocks[p.blocks.length - 1]?.end ?? -1,
      used: p.used,
      head: p.blocks[0]?.tableId ?? null,
    })),
  });
  if (signature === prev.signature) return;

  view.dispatch(
    view.state.tr.setMeta(MEASURE_META, {
      decorations: newSet,
      footerContentHeight,
      signature,
    } satisfies PageState),
  );
}

function rowHasHeader(row: PmNode): boolean {
  let has = false;
  row.forEach((cell) => {
    if (cell.type.name === "tableHeader") has = true;
  });
  return has;
}

/**
 * 표 열 너비를 각 셀에 inline 고정. display:contents 로 colgroup 이 무력화되므로,
 * colgroup col 의 style.width(updateColumns 가 설정)을 읽어 모든 행의 같은 열 셀에
 * 동일 width 부여. colspan 합산. → 스크롤 방지·열 정렬 유지.
 */
function applyColumnWidths(view: EditorView): void {
  const wrappers = view.dom.querySelectorAll<HTMLElement>(".tableWrapper");
  wrappers.forEach((wrapper) => {
    const cols = Array.from(wrapper.querySelectorAll<HTMLElement>("colgroup col"));
    if (!cols.length) return;
    const widths = cols.map((c) => parseInt(c.style.width, 10) || 0);
    const totalHasWidth = widths.some((w) => w > 0);
    const rows = wrapper.querySelectorAll<HTMLElement>("tbody > tr");
    rows.forEach((row) => {
      const cells = Array.from(row.children) as HTMLElement[];
      let col = 0;
      for (const cell of cells) {
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
        let w = 0;
        for (let j = 0; j < colspan; j++) w += widths[col + j] || 0;
        cell.style.width = totalHasWidth && w > 0 ? `${w}px` : "";
        col += colspan;
      }
    });
  });
}

/** 최상위 블록 측정. table 노드는 행(tableRow) 단위로 분해. */
function measureBlocks(view: EditorView): MeasuredBlock[] {
  const blocks: MeasuredBlock[] = [];
  const win = view.dom.ownerDocument.defaultView;
  let tableSeq = 0;

  const pushBlock = (
    dom: unknown,
    pos: number,
    node: PmNode,
    extra: Partial<MeasuredBlock> = {},
  ) => {
    if (!(dom instanceof HTMLElement)) return;
    const cs = win?.getComputedStyle(dom);
    const mt = cs ? parseFloat(cs.marginTop) || 0 : 0;
    const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
    blocks.push({
      pos,
      end: pos + node.nodeSize,
      node,
      marginTop: mt,
      marginBottom: mb,
      height: dom.offsetHeight,
      isTable: false,
      ...extra,
    });
  };

  view.state.doc.forEach((node, offset) => {
    if (node.type.name === "table") {
      const tid = ++tableSeq;
      node.forEach((row, rowOffset) => {
        const pos = offset + 1 + rowOffset;
        pushBlock(view.nodeDOM(pos), pos, row, {
          tableId: tid,
          isHeader: rowHasHeader(row),
        });
      });
      return;
    }
    pushBlock(view.nodeDOM(offset), offset, node);
  });
  return blocks;
}

function measureFooterContentHeight(view: EditorView): number {
  const fc = view.dom.querySelector(".rm-page-footer-content") as HTMLElement | null;
  return fc ? fc.clientHeight : 0;
}

/** 그리디 원자적 배치. 행 포함 모든 단위 atomic. 헤더 반복 높이 선반영. */
function paginate(blocks: MeasuredBlock[], pageContentAreaHeight: number): Page[] {
  const pages: Page[] = [];
  let cur: Page = { blocks: [], used: 0 };
  let prevMB = 0;
  let prevTableId: number | undefined = undefined;

  const headerHeights = new Map<number, number>();
  for (const b of blocks) {
    if (b.isHeader && b.tableId !== undefined) headerHeights.set(b.tableId, b.height);
  }

  const outerHeight = (b: MeasuredBlock, firstOnPage: boolean) => {
    const topGap = firstOnPage ? b.marginTop : Math.max(prevMB, b.marginTop);
    return topGap + b.height;
  };

  for (const b of blocks) {
    let outer = outerHeight(b, cur.blocks.length === 0);
    const continuedTable =
      cur.blocks.length === 0 &&
      b.tableId !== undefined &&
      prevTableId === b.tableId;
    const headerExtra =
      continuedTable && b.tableId !== undefined ? (headerHeights.get(b.tableId) ?? 0) : 0;

    const fits =
      cur.blocks.length === 0 || cur.used + outer + headerExtra <= pageContentAreaHeight;
    if (!fits) {
      pages.push(cur);
      cur = { blocks: [], used: 0 };
      outer = outerHeight(b, true);
    }
    if (cur.blocks.length === 0 && headerExtra) cur.used += headerExtra;
    cur.used += outer;
    cur.blocks.push(b);
    prevMB = b.marginBottom;
    if (b.tableId !== undefined) prevTableId = b.tableId;
    else prevTableId = undefined;
  }
  if (cur.blocks.length) pages.push(cur);
  return pages;
}

function buildDecorations(
  view: EditorView,
  pages: Page[],
  blocks: MeasuredBlock[],
  o: ResolvedOpts,
): Decoration[] {
  const decos: Decoration[] = [];
  const headerZone = o.marginTop + o.contentMarginTop;
  const footerZone = o.contentMarginBottom + o.marginBottom + o.footerContentHeight;
  const pageContentAreaHeight = Math.max(1, o.pageHeight - headerZone - footerZone);

  pages.forEach((page, i) => {
    const isLast = i === pages.length - 1;
    const nextFirst = !isLast ? pages[i + 1].blocks[0] : undefined;
    const continuedHeaderRow =
      nextFirst && nextFirst.tableId !== undefined &&
      page.blocks.some((b) => b.tableId === nextFirst.tableId)
        ? blocks.find((b) => b.tableId === nextFirst.tableId && b.isHeader)
        : undefined;

    const lastBlock = page.blocks[page.blocks.length - 1];
    if (!lastBlock) return;

    const leftover = Math.max(0, pageContentAreaHeight - page.used);
    decos.push(
      Decoration.widget(
        lastBlock.end,
        () =>
          makePageBreak(
            leftover,
            o,
            isLast,
            continuedHeaderRow ? cloneRowWidget(view, continuedHeaderRow) : null,
          ),
        { side: 1 },
      ),
    );
  });
  return decos;
}

function cloneRowWidget(view: EditorView, headerRow: MeasuredBlock): HTMLElement {
  const dom = view.nodeDOM(headerRow.pos);
  if (dom instanceof HTMLElement) return dom.cloneNode(true) as HTMLElement;
  return document.createElement("div");
}

/**
 * 페이지 경계 위젯: [fill][footer][gap][header(+표헤더반복)].
 * insideTable=false(표 밖): 음수 margin 으로 전체 너비(구분바 전체 덮음).
 * insideTable=true(표 행 사이): content 너비 — 음수 margin 이 tableWrapper(overflow-x:auto)
 *   너비 초과로 가로 스크롤을 유발하지 않도록.
 */
function makePageBreak(
  leftover: number,
  o: ResolvedOpts,
  isLast: boolean,
  repeatedHeader?: HTMLElement | null,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "rm-page-break" + (isLast ? " rm-page-break-last" : "");
  // 항상 전체 너비(음수 margin 확장) → 분절 gap 100%. tableWrapper overflow-x:visible 로 스크롤 않음.
  wrap.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`;
  wrap.style.marginLeft = `calc(-1 * var(--rm-margin-left))`;
  wrap.style.marginRight = `calc(-1 * var(--rm-margin-right))`;

  const fill = document.createElement("div");
  fill.className = "rm-page-fill";
  fill.style.height = `${leftover}px`;
  wrap.appendChild(fill);

  const footer = document.createElement("div");
  footer.className = "rm-page-footer";
  const footerContent = document.createElement("div");
  footerContent.className = "rm-page-footer-content";
  const fl = document.createElement("div");
  fl.className = "rm-page-footer-left";
  fl.innerHTML = (o.footerLeft || "").replace("{page}", `<span class="rm-page-number"></span>`);
  const fr = document.createElement("div");
  fr.className = "rm-page-footer-right";
  fr.innerHTML = (o.footerRight || "").replace("{page}", `<span class="rm-page-number"></span>`);
  footerContent.append(fl, fr);
  footer.appendChild(footerContent);
  wrap.appendChild(footer);

  const gap = document.createElement("div");
  gap.className = "rm-pagination-gap";
  gap.style.height = `${o.pageGap}px`;
  gap.style.backgroundColor = o.pageBreakBackground;
  gap.style.borderTop = "1px solid";
  gap.style.borderBottom = "1px solid";
  gap.style.borderLeft = "1px solid";
  gap.style.borderRight = "1px solid";
  gap.style.borderColor = o.pageBreakBackground;
  wrap.appendChild(gap);

  const header = document.createElement("div");
  header.className = "rm-page-header";
  wrap.appendChild(header);

  // 헤더 반복: 본체(content 영역)와 같은 너비 + 본체 첫 행에 바로 붙도록 header zone 뒤 별도 wrapper.
  if (repeatedHeader) {
    const repeatWrap = document.createElement("div");
    repeatWrap.className = "rm-page-header-repeat";
    // 위젯이 전체 너비(음수 margin) → 좌우 margin 들여 본체(content) 정렬.
    repeatWrap.style.boxSizing = "border-box";
    repeatWrap.style.paddingLeft = "var(--rm-margin-left)";
    repeatWrap.style.paddingRight = "var(--rm-margin-right)";
    repeatWrap.appendChild(repeatedHeader);
    wrap.appendChild(repeatWrap);
  }

  return wrap;
}

function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .rm-with-pagination, .rm-with-pagination .rm-first-page-header { counter-reset: page-number 1; }
    .rm-with-pagination .rm-page-break { counter-increment: page-number; }
    .rm-with-pagination .rm-page-number::before { content: counter(page-number); }
    .rm-with-pagination .rm-page-break-last .rm-pagination-gap,
    .rm-with-pagination .rm-page-break-last .rm-page-header { display: none; }

    .rm-with-pagination .rm-page-fill { width: 100%; }
    .rm-with-pagination .rm-pagination-gap { width: 100%; }
    .rm-with-pagination .rm-page-header-repeat { width: 100%; }
    .rm-with-pagination .rm-page-header,
    .rm-with-pagination .rm-page-footer { width: 100%; }
    .rm-with-pagination .rm-page-header { padding-top: var(--rm-margin-top); padding-bottom: var(--rm-content-margin-top); }
    .rm-with-pagination .rm-page-footer { display: flex; justify-content: space-between; padding-top: var(--rm-content-margin-bottom); padding-bottom: var(--rm-margin-bottom); }
    .rm-with-pagination .rm-page-footer-right { display: inline-block; margin-right: var(--rm-margin-right); }
    .rm-with-pagination .rm-page-footer-left { display: inline-block; margin-left: var(--rm-margin-left); }
  `;
  doc.head.appendChild(style);
}

function removeStyles(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
}

function applyContainerStyles(dom: HTMLElement, o: MeasurePaginationOptions): void {
  dom.classList.add("rm-with-pagination");
  dom.style.width = "var(--rm-page-width)";
  dom.style.border = "1px solid var(--rm-page-gap-border-color)";
  dom.style.paddingLeft = "var(--rm-margin-left)";
  dom.style.paddingRight = "var(--rm-margin-right)";
  dom.style.paddingTop = `calc(var(--rm-margin-top) + var(--rm-content-margin-top))`;
  dom.style.paddingBottom = "0px";
  dom.style.setProperty("--rm-page-height", `${o.pageHeight}px`);
  dom.style.setProperty("--rm-page-width", `${o.pageWidth}px`);
  dom.style.setProperty("--rm-margin-top", `${o.marginTop}px`);
  dom.style.setProperty("--rm-margin-bottom", `${o.marginBottom}px`);
  dom.style.setProperty("--rm-margin-left", `${o.marginLeft}px`);
  dom.style.setProperty("--rm-margin-right", `${o.marginRight}px`);
  dom.style.setProperty("--rm-content-margin-top", `${o.contentMarginTop}px`);
  dom.style.setProperty("--rm-content-margin-bottom", `${o.contentMarginBottom}px`);
  dom.style.setProperty("--rm-page-gap-border-color", o.pageGapBorderColor);
}
