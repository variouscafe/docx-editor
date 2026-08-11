import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

/**
 * 측정 기반 A4 페이지네이션 (tiptap-pagination-plus 대체).
 *
 * 배경 — tiptap-pagination-plus 는 float 기반(.breaker/.page 가 float:left).
 * float 이 전체너비로 흐를 때 display:table(BFC) 표가 float 을 피해 우측으로
 * 찌그러지거나 불투명 gap(zIndex:2)에 덮여 "표가 다음 페이지로 넘어가면 안 보이는"
 * 버그가 발생. CSS 트위킹(clear:both 등)으로는 해결 불가(빈 페이지 폭발).
 *
 * 이 확장은 float 를 **전혀 쓰지 않는다**. 최상위 블록별 offsetHeight 를 측정해
 * 그리디 원자적 배치(atomic placement)를 하고, 페이지 경계마다 **normal-flow 위젯**
 * (float 아님)을 끼워 넣는다. 표가 페이지에 안 들어가면 통째로 다음 페이지로.
 *
 * 시각 모델은 라이브러리와 동일 재현: 에디터는 하나의 연속된 흰 사각형, 페이지
 * 이음새마다 [footer][gap][header] 위젯. 동일 CSS 클래스명을 써 getPreviewStyles /
 * index.css 는 한 줄도 안 바뀜.
 *
 * [핵심] 구분 바(.rm-page-break)는 좌우 페이지 여백(--rm-margin-*)까지 음수 margin
 * 으로 확장 → 회색 gap 이 페이지 전체 너비(100%)를 덮어 페이지가 '잘린' 것처럼 보임.
 * (라이브러리 .breaker 의 width/margin-left/right 와 동일 공식.)
 * 이전 버전에서 이 확장이 빠져 gap 이 가운데 90% 만 덮어 페이지가 이어진 것처럼
 * 보였던 버그 수정.
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
  /** 헤더/바디, 푸터/바디 사이 여백(라이브러리 기본 10px). */
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
  /** pos + node.nodeSize (블록 끝 직후). */
  end: number;
  node: PmNode;
  marginTop: number;
  marginBottom: number;
  /** offsetHeight (border+padding, margin 제외). */
  height: number;
  isTable: boolean;
}

interface Page {
  blocks: MeasuredBlock[];
  /** 페이지 블록 누적 높이(margin 포함). */
  used: number;
}

interface PageState {
  decorations: DecorationSet;
  /** 직전 측정된 footer 콘텐츠 라인 높이. 첫 패스엔 0 → 추정 fallback. */
  footerContentHeight: number;
  /** 배치 서명. 변화 없으면 dispatch 안 함 → 루프 방지. */
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

    // 콘텐츠 높이 변화(이미지·지연 폰트·embed) 감지 → 재측정.
    const ro = new ResizeObserver(() => scheduleMeasure(view, getOpts));
    ro.observe(view.dom);
    this.storage.resizeObserver = ro;

    // 폰트 로드 완료 후 레이아웃 시프트 보정.
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
              // 편집으로 pos 밀림 → 기존 위젯도 이동(깜빡임 최소화). 다음 update 에서 전체 재측정.
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
  // 파괴된 뷰 가드(EditorView destroy 시 docView=null — 내부 프로퍼티라 타입엔 노출 안 됨).
  if (!(view as { docView?: unknown }).docView) return;

  const opts = getOpts();
  if (!opts.enabled) return;

  const prev = measurePaginationKey.getState(view.state) ?? {
    decorations: DecorationSet.empty,
    footerContentHeight: 0,
    signature: "",
  };

  const blocks = measureBlocks(view);
  const measuredFooter = measureFooterContentHeight(view);
  const footerContentHeight = measuredFooter || prev.footerContentHeight || 18;

  const headerZone = opts.marginTop + opts.contentMarginTop;
  const footerZone = opts.contentMarginBottom + opts.marginBottom + footerContentHeight;
  const pageContentAreaHeight = Math.max(1, opts.pageHeight - headerZone - footerZone);

  const pages = paginate(blocks, pageContentAreaHeight);
  const decos = buildDecorations(pages, { ...opts, footerContentHeight });
  const newSet = DecorationSet.create(view.state.doc, decos);

  const signature = JSON.stringify({
    footer: footerContentHeight,
    pages: pages.map((p) => ({ end: p.blocks[p.blocks.length - 1]?.end ?? -1, used: p.used })),
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

function measureBlocks(view: EditorView): MeasuredBlock[] {
  const blocks: MeasuredBlock[] = [];
  const win = view.dom.ownerDocument.defaultView;
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const cs = win?.getComputedStyle(dom);
    const mt = cs ? parseFloat(cs.marginTop) || 0 : 0;
    const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
    blocks.push({
      pos: offset,
      end: offset + node.nodeSize,
      node,
      marginTop: mt,
      marginBottom: mb,
      height: dom.offsetHeight,
      isTable: node.type.name === "table",
    });
  });
  return blocks;
}

function measureFooterContentHeight(view: EditorView): number {
  const fc = view.dom.querySelector(".rm-page-footer-content") as HTMLElement | null;
  return fc ? fc.clientHeight : 0;
}

/**
 * 그리디 원자적 배치. 모든 최상위 블록은 atomic(표 포함).
 * 인접 블록 수직 margin collapse 를 max(prevMB, mt) 로 근사.
 */
function paginate(blocks: MeasuredBlock[], pageContentAreaHeight: number): Page[] {
  const pages: Page[] = [];
  let cur: Page = { blocks: [], used: 0 };
  let prevMB = 0;

  const outerHeight = (b: MeasuredBlock, firstOnPage: boolean) => {
    const topGap = firstOnPage ? b.marginTop : Math.max(prevMB, b.marginTop);
    return topGap + b.height;
  };

  for (const b of blocks) {
    let outer = outerHeight(b, cur.blocks.length === 0);
    const fits = cur.blocks.length === 0 || cur.used + outer <= pageContentAreaHeight;
    if (!fits) {
      pages.push(cur);
      cur = { blocks: [], used: 0 };
      outer = outerHeight(b, true);
    }
    cur.used += outer;
    cur.blocks.push(b);
    prevMB = b.marginBottom;
  }
  if (cur.blocks.length) pages.push(cur);
  return pages;
}

function buildDecorations(pages: Page[], o: ResolvedOpts): Decoration[] {
  const decos: Decoration[] = [];
  const headerZone = o.marginTop + o.contentMarginTop;
  const footerZone = o.contentMarginBottom + o.marginBottom + o.footerContentHeight;
  const pageContentAreaHeight = Math.max(1, o.pageHeight - headerZone - footerZone);

  pages.forEach((page, i) => {
    const isLast = i === pages.length - 1;
    const lastBlock = page.blocks[page.blocks.length - 1];
    if (!lastBlock) return;
    const leftover = Math.max(0, pageContentAreaHeight - page.used);
    decos.push(
      Decoration.widget(lastBlock.end, () => makePageBreak(leftover, o, isLast), { side: 1 }),
    );
  });
  return decos;
}

/** 단일 페이지 경계 위젯: [fill(leftover)][footer][gap][header]. 모두 normal flow(float 없음). */
function makePageBreak(leftover: number, o: ResolvedOpts, isLast: boolean): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "rm-page-break" + (isLast ? " rm-page-break-last" : "");
  // [핵심] 좌우 페이지 여백까지 음수 margin 으로 확장 → gap 이 페이지 전체 너비 덮음.
  // 라이브러리 .breaker 의 width/margin 공식과 동일.
  wrap.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`;
  wrap.style.marginLeft = `calc(-1 * var(--rm-margin-left))`;
  wrap.style.marginRight = `calc(-1 * var(--rm-margin-right))`;

  // 페이지 하단 빈 공간(표가 다음 페이지로 밀릴 때 채워짐).
  const fill = document.createElement("div");
  fill.className = "rm-page-fill";
  fill.style.height = `${leftover}px`;
  wrap.appendChild(fill);

  // footer(현재 페이지 번호) — 라이브러리 getFooter 와 동일 구조/클래스.
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

  // 페이지 이음새 회색 gap(전체 너비).
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

  // 다음 페이지 헤더 영역(비어있음, headerZone 높이만).
  const header = document.createElement("div");
  header.className = "rm-page-header";
  wrap.appendChild(header);

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

/** 에디터 컨테이너에 라이브러리와 동일한 인라인 스타일·CSS 변수 적용. */
function applyContainerStyles(dom: HTMLElement, o: MeasurePaginationOptions): void {
  dom.classList.add("rm-with-pagination");
  dom.style.width = "var(--rm-page-width)";
  dom.style.border = "1px solid var(--rm-page-gap-border-color)";
  dom.style.paddingLeft = "var(--rm-margin-left)";
  dom.style.paddingRight = "var(--rm-margin-right)";
  // 첫 페이지 상단 = marginTop + contentMarginTop(headerZone). 이후 페이지는 위젯의 header.
  dom.style.paddingTop = `calc(var(--rm-margin-top) + var(--rm-content-margin-top))`;
  // 마지막 페이지 하단 marginBottom 는 마지막 위젯의 footer padding 이 담당.
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
