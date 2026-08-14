import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
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

export interface PageMargins {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

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
  /**
   * 마진을 옵션에서 실시간 산출하는 getter. 주어지면 마운트 고정값(marginTop/… ) 대신
   * 매 측정마다 최신 마진을 사용 → 사용자가 옵션 패널에서 페이지 여백을 바꾸면 시각
   * (CSS var --rm-margin-*) 과 페이지네이션(pageContentAreaHeight) 이 모두 즉시 갱신.
   * 미제공 시 기존처럼 configure 시점 고정값 사용.
   */
  getMargins?: () => PageMargins;
}

export const measurePaginationKey = new PluginKey<PageState>("measurePagination");
const MEASURE_META = "measurePagination.measure";
const STYLE_ID = "rm-measure-pagination-style";

export interface MeasuredBlock {
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

export interface Page {
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
// 직전 측정 시의 doc 참조. view.update 에서 doc 미변경(선택만 이동) 시 재측정을 스킵하기 위함.
const lastDocs = new WeakMap<EditorView, PmNode>();
// forceRemeasure 가 update 훅(클로저 getOpts) 을 거치지 않고 직접 측정을 예약하기 위한 getter 홀더.
const optsGetters = new WeakMap<EditorView, OptionsGetter>();
// 증분 측정 — ProseMirror 구조 공유로 편집되지 않은 노드는 객체 참조가 유지되므로
// 노드 참조 → 측정값 WeakMap 캐시로 키 입력마다 "전체" 블록을 리플로우 측정하는 비용을 없앤다.
// 레이아웃이 일괄 변하는 시점(옵션 변경·리사이즈·폰트 로드·강제 재측정)은 강제 플래그로
// 캐시를 우회해 전측정한다.
const blockMeasureCache = new WeakMap<
  PmNode,
  { marginTop: number; marginBottom: number; height: number }
>();
const forceFullMeasure = new WeakMap<EditorView, boolean>();

/** getMargins 가 있으면 최신 마진, 없으면 configure 고정값. */
function resolveMargins(opts: MeasurePaginationOptions): PageMargins {
  return (
    opts.getMargins?.() ?? {
      marginTop: opts.marginTop,
      marginBottom: opts.marginBottom,
      marginLeft: opts.marginLeft,
      marginRight: opts.marginRight,
    }
  );
}

/**
 * 마진 옵션 변경을 시각에 즉시 반영 — 4개 margin CSS var 만 갱신.
 * paddingTop/Left/Right 는 이 변수들을 참조(calc/var) 하므로 var 갱신만으로 본문 여백이 재계산.
 * 값이 같으면 브라우저가 reflow 를 유발하지 않아 매 측정마다 호출해도 안전.
 */
function syncMarginVars(dom: HTMLElement, m: PageMargins): void {
  dom.style.setProperty("--rm-margin-top", `${m.marginTop}px`);
  dom.style.setProperty("--rm-margin-bottom", `${m.marginBottom}px`);
  dom.style.setProperty("--rm-margin-left", `${m.marginLeft}px`);
  dom.style.setProperty("--rm-margin-right", `${m.marginRight}px`);
}

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
    optsGetters.set(view, getOpts); // forceRemeasure 가 최신 옵션 getter 에 접근하도록.
    injectStyles(view.dom.ownerDocument);
    // 마운트 시점에도 고정값이 아닌 최신 옵션 마진으로 적용(getMargins 우선).
    applyContainerStyles(view.dom, { ...this.options, ...resolveMargins(this.options) });

    const ro = new ResizeObserver(() => scheduleMeasure(view, getOpts, true));
    ro.observe(view.dom);
    this.storage.resizeObserver = ro;

    const fonts = (view.dom.ownerDocument as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => scheduleMeasure(view, getOpts, true)).catch(() => {});

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
          update: (view: EditorView) => {
            // 문서가 바뀌지 않은(선택만 이동/스크롤) 업데이트는 측정을 스킵 — 대문서에서 클릭·이동
            // 시마다 전체 블록을 재측정(offsetHeight/getComputedStyle 리플로우) 하는 비용을 없앤다.
            // 옵션 변경·장식 변경·no-op kick 등 문서 외 원인으로 재측정이 필요하면 forceRemeasure(editor)
            // 로 예약(이 경로는 이 가드를 우회함).
            const prevDoc = lastDocs.get(view);
            lastDocs.set(view, view.state.doc);
            if (prevDoc === view.state.doc) return;
            scheduleMeasure(view, getOpts);
          },
        }),
      }),
    ];
  },
});

function scheduleMeasure(view: EditorView, getOpts: OptionsGetter, force = false): void {
  if (force) forceFullMeasure.set(view, true);
  const existing = rafTokens.get(view);
  if (existing !== undefined) cancelAnimationFrame(existing);
  const token = requestAnimationFrame(() => {
    rafTokens.delete(view);
    runMeasure(view, getOpts);
  });
  rafTokens.set(view, token);
}

/**
 * 외부(옵션 변경·no-op kick 등)에서 페이지네이션 재측정을 강제 예약.
 * view.update 의 "doc 미변경 시 스킵" 가드를 우회해 바로 scheduleMeasure 호출.
 * 문서를 바꾸지 않고도 블록 높이/마진/장식이 바뀐 경우(옵션 패널 편집, 공유 보기 마운트) 에 사용.
 */
export function forceRemeasure(editor: Editor): void {
  if (editor.isDestroyed) return;
  const view = editor.view;
  const getOpts = optsGetters.get(view);
  if (!getOpts) return;
  lastDocs.set(view, view.state.doc); // 직후 update 가 중복 예약하지 않도록 기준 갱신.
  scheduleMeasure(view, getOpts, true);
}

function runMeasure(view: EditorView, getOpts: OptionsGetter): void {
  if (!(view as { docView?: unknown }).docView) return;
  const opts = getOpts();
  if (!opts.enabled) return;

  // 마진을 옵션에서 실시간 산출. CSS var 동기화 → 시각 여백 즉시 반영(서명 비교 전에 실행해
  // 페이지 구조가 동일해 페이지 수가 안 바뀌더라도 여백은 갱신).
  const margins = resolveMargins(opts);
  syncMarginVars(view.dom, margins);

  const prev = measurePaginationKey.getState(view.state) ?? {
    decorations: DecorationSet.empty,
    footerContentHeight: 0,
    signature: "",
  };

  const force = forceFullMeasure.get(view) ?? true; // 최초 1회는 전측정
  const blocks = measureBlocks(view, force);
  forceFullMeasure.set(view, false);
  const measuredFooter = measureFooterContentHeight(view);
  const footerContentHeight = measuredFooter || prev.footerContentHeight || 18;

  const headerZone = margins.marginTop + opts.contentMarginTop;
  const footerZone = opts.contentMarginBottom + margins.marginBottom + footerContentHeight;
  const pageContentAreaHeight = Math.max(1, opts.pageHeight - headerZone - footerZone);

  const pages = paginate(blocks, pageContentAreaHeight);
  const decos = buildDecorations(view, pages, blocks, { ...opts, ...margins, footerContentHeight });
  const newSet = DecorationSet.create(view.state.doc, decos);

  const signature = JSON.stringify({
    footer: footerContentHeight,
    // 마진 포함 — 페이지 구조가 같아도 마진 변경 시 leftover(fill 높이)를 다시 계산해야 함.
    margins,
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

/**
 * 행이 "헤더 행"인지 판정 — 행의 **모든** 셀이 tableHeader 일 때만 참.
 * (기존 ANY 판정은 헤더 "열"(toggleHeaderColumn) 표에서 모든 데이터 행의 첫 셀이
 * tableHeader 라 모든 행이 헤더로 취급 → 연속 페이지마다 첫 데이터 행이 "반복 헤더"로
 * 복제되는 버그. 일반적인 헤더 행은 전 셀이 th 이므로 ALL 판정으로 충분.)
 */
export function rowHasHeader(row: PmNode): boolean {
  let all = true;
  row.forEach((cell) => {
    if (cell.type.name !== "tableHeader") all = false;
  });
  return all;
}

/** 표에 rowspan>1 셀이 있는지(previewStyles 가 display:table 로 전환할지 결정). */
function tableHasRowspan(table: PmNode): boolean {
  let found = false;
  table.forEach((row) => {
    row.forEach((cell) => {
      if ((cell.attrs.rowspan as number | undefined || 1) > 1) found = true;
    });
  });
  return found;
}

/**
 * 꼬마글씨2(annotationMode 2) 위젯 — 블록 뒤 형제 <p data-annotation-paragraph> 들이
 * 문서 플로우 높이를 실제로 차지하므로 블록 높이에 합산한다.
 * (측정에서 빠지면 주석이 달린 문단들이 페이지 하단을 넘어간다.)
 */
function annotation2WidgetHeight(dom: HTMLElement, win: Window | null): number {
  let total = 0;
  let sib = dom.nextElementSibling as HTMLElement | null;
  while (sib && sib.hasAttribute("data-annotation-paragraph")) {
    const cs = win?.getComputedStyle(sib);
    total +=
      sib.offsetHeight +
      (cs ? parseFloat(cs.marginTop) || 0 : 0) +
      (cs ? parseFloat(cs.marginBottom) || 0 : 0);
    sib = sib.nextElementSibling as HTMLElement | null;
  }
  return total;
}

/**
 * 최상위 블록 측정. table 노드는 행(tableRow) 단위로 분해.
 * force=false 면 증분 측정 — 구조 공유로 참조가 유지된(편집되지 않은) 노드는
 * WeakMap 캐시의 측정값을 재사용하고(getComputedStyle/offsetHeight 리플로우 없음),
 * 이번 트랜잭션에서 참조가 바뀐(편집된) 블록만 실측한다.
 */
function measureBlocks(view: EditorView, force: boolean): MeasuredBlock[] {
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
    if (!force) {
      const cached = blockMeasureCache.get(node);
      if (cached) {
        blocks.push({
          pos,
          end: pos + node.nodeSize,
          node,
          ...cached,
          isTable: false,
          ...extra,
        });
        return;
      }
    }
    const cs = win?.getComputedStyle(dom);
    const mt = cs ? parseFloat(cs.marginTop) || 0 : 0;
    const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
    const measured = {
      marginTop: mt,
      marginBottom: mb,
      height: dom.offsetHeight + annotation2WidgetHeight(dom, win),
    };
    blockMeasureCache.set(node, measured);
    blocks.push({
      pos,
      end: pos + node.nodeSize,
      node,
      ...measured,
      isTable: false,
      ...extra,
    });
  };

  view.state.doc.forEach((node, offset) => {
    if (node.type.name === "table") {
      if (tableHasRowspan(node)) {
        // rowspan 표: display:table 로 통째 렌더 → 행 단위 분해 불가, 페이지 분할도 통째.
        // 표 전체를 단일 블록으로 측정/배치.
        //
        // [설계 한계] 표가 페이지 본문 영역보다 크면 그대로 한 블록으로 배치된다.
        // 페이지는 고정 프레임이 아니라 fill+footer+gap 위젯이 만드는 연속 플로우라
        // 콘텐츠 겹침은 없다(leftover=0 → fill 없이 표 바로 아래 footer/gap 이 붙음).
        // 단 이때 "A4 한 장" 프레임 개념이 깨져 표가 페이지 경계를 시각적으로 무시한
        // 긴 한 장처럼 보인다 — 원자적(분할 불가) 배치의 의도된 동작.
        pushBlock(view.nodeDOM(offset), offset, node);
        return;
      }
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

/** 그리디 원자적 배치. 행 포함 모든 단위 atomic. 헤더 반복 높이 선반영. (단위 테스트용 export) */
export function paginate(blocks: MeasuredBlock[], pageContentAreaHeight: number): Page[] {
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
    // 페이지 리셋 직후에도 재계산 필요 — 리셋 전(구 cur 기준)의 판정은 항상 거짓이라
    // 반복 헤더 높이가 페이지 used 에 반영되지 않고 footer/fill 이 하단을 뚫었다.
    const headerExtraFor = (): number =>
      cur.blocks.length === 0 && b.tableId !== undefined && prevTableId === b.tableId
        ? (headerHeights.get(b.tableId) ?? 0)
        : 0;
    let headerExtra = headerExtraFor();

    const fits =
      cur.blocks.length === 0 || cur.used + outer + headerExtra <= pageContentAreaHeight;
    if (!fits) {
      pages.push(cur);
      cur = { blocks: [], used: 0 };
      outer = outerHeight(b, true);
      headerExtra = headerExtraFor();
    }
    if (headerExtra) cur.used += headerExtra;
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
  appendFooterTemplate(fl, o.footerLeft || "");
  const fr = document.createElement("div");
  fr.className = "rm-page-footer-right";
  appendFooterTemplate(fr, o.footerRight || "");
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

/**
 * 푸터 템플릿 문자열을 DOM 으로 조립 — "{page}" 를 페이지번호 span 으로 치환.
 * innerHTML 미사용: 옵션 문자열이 그대로 텍스트 노드가 되므로 HTML 파싱/주입면이 없다.
 */
function appendFooterTemplate(target: HTMLElement, template: string): void {
  const parts = template.split("{page}");
  parts.forEach((part, i) => {
    if (i > 0) {
      const num = document.createElement("span");
      num.className = "rm-page-number";
      target.appendChild(num);
    }
    if (part) target.appendChild(document.createTextNode(part));
  });
}

// 문서별 <style> 참조 카운트 — MeasurePagination 에디터가 여러 개 마운트돼도
// 한쪽 onDestroy 가 다른 쪽이 쓰는 스타일을 제거하지 않도록 한다.
const styleRefCounts = new WeakMap<Document, number>();

function injectStyles(doc: Document): void {
  const prev = styleRefCounts.get(doc) ?? 0;
  styleRefCounts.set(doc, prev + 1);
  if (prev > 0 || doc.getElementById(STYLE_ID)) return;
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
  const next = (styleRefCounts.get(doc) ?? 0) - 1;
  if (next > 0) {
    styleRefCounts.set(doc, next);
    return; // 아직 다른 에디터가 사용 중 — 스타일 유지.
  }
  styleRefCounts.delete(doc);
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
