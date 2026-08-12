import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCellFormat } from "../Editor/extensions/tableCellFormat";
import { TableDeleteGuard } from "../Editor/extensions/tableDeleteGuard";
import { TableCellDragSelect } from "../Editor/extensions/tableCellDragSelect";
import { TableFormulaPlugin } from "../Editor/extensions/tableFormulaPlugin";
import { MeasurePagination } from "../Editor/extensions/measurePagination";
import { BoxBorder } from "../Editor/extensions/boxBorder";
import { HighlightExtension } from "../Editor/extensions/highlightColors";
import { AnnotationExtension } from "../Editor/extensions/annotation";
import { CoreSummaryExtension } from "../Editor/extensions/coreSummary";
import { TitleExtension } from "../Editor/extensions/title";
import { HeadingHardBreak } from "../Editor/extensions/headingHardBreak";
import { FontSize } from "../Editor/extensions/fontSize";
import { PreviewDecorations } from "../Editor/extensions/previewDecorations";
import { HeadingPrefix, HeadingPrefixSync } from "../Editor/extensions/headingPrefix";
import type { DocxOptions } from "@shared/options";

// A4 세로(96DPI px). tiptap-pagination-plus 의존 제거 — 리터럴로 고정.
// PAGE_SIZES.A4 = getPageSize(1123, 794, ...) → { pageHeight:1123, pageWidth:794 } 와 동일.
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

/** 모바일/터치 입력 여부 — handleClick 보정을 터치에서만 켠다(데스크탑은 PM 기본 posAtCoords 가 정확). */
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

export interface PreviewExtensionsOptions {
  /** Decoration/MeasurePagination 플러그인이 읽을 최신 DocxOptions(레퍼런스 홀더 getOptions). */
  getOptions: () => DocxOptions;
  pageHeight: number;
  pageWidth: number;
}

/**
 * 미리보기 에디터의 extensions 배열 + editorProps 를 만든다. React 프리(상태/훅 없음) 팩토리 →
 * useEditor(usePreviewEditor)와 jsdom 통합 테스트 양쪽에서 재사용 가능.
 */
export function createPreviewExtensions(opts: PreviewExtensionsOptions) {
  const options = opts.getOptions();
  const extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // 사내 양식은 헤딩 시작기호(1., ①, □, -, •)가 번호/불릿 역할을 하므로
      // TipTap 기본 리스트 노드·input rule(`- `, `* `, `1. ` 자동변환)은 비활성화.
      // → "1. " 입력이 번호 리스트로 변형되어 H1 기호(1.)와 충돌하는 문제 방지.
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    BoxBorder,
    FontSize,
    HighlightExtension,
    AnnotationExtension,
    CoreSummaryExtension,
    TitleExtension,
    HeadingHardBreak,
    HeadingPrefix,
    HeadingPrefixSync.configure({ getOptions: opts.getOptions }),
    PreviewDecorations.configure({ getOptions: opts.getOptions }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCellFormat,
    TableHeader,
    // 표 셀에서 Backspace/Delete(모바일 beforeinput 포함)가 셀 경계를 넘어
    // 행/구조를 삭제하는 현상 방지(우선순위 1000으로 keymap보다 먼저 가로챔).
    TableDeleteGuard,
    // 모바일 터치로 표 셀 드래그 범위 선택(CellSelection) — 데스크탑 마우스 드래그와 동등.
    TableCellDragSelect,
    // 표 계산(포맷/수식) 반응형 — shared 엔진으로 셀 표시 텍스트 실시간 동기화 +
    // 수식 셀 읽기전용 보호. 미리보기 == DOCX 출력.
    TableFormulaPlugin,
    MeasurePagination.configure({
      pageHeight: opts.pageHeight,
      pageWidth: opts.pageWidth,
      pageGap: 30,
      pageBreakBackground: "var(--preview-gap)",
      marginTop: (options.common.marginTop / 2.54) * 72,
      marginBottom: (options.common.marginBottom / 2.54) * 72,
      marginLeft: (options.common.marginLeft / 2.54) * 72,
      marginRight: (options.common.marginRight / 2.54) * 72,
      footerRight: "{page}",
    }),
  ];

  const editorProps = {
    // 모바일(터치)에서 터치한 DOM(event.target) 기반으로 커서를 옮긴다.
    // 표가 display:contents/flex 로 렌더링·contenteditable 이 transform:scale 안에 있어
    // PM 기본 posAtCoords(caretFromPoint)가 틀린 위치를 반환하는 것을 우회.
    // 데스크탑(coarse pointer 아님)은 return false → PM 기본(정확)에 맡긴다.
    // return true 로 PM 기본 selection 처리를 스킵해 1순위(posAtCoords 왜곡)·2순위(스크롤 선점) 모두 우회.
    handleClick(view: EditorView, _pos: number, event: MouseEvent) {
      if (!view.editable || !isCoarsePointer()) return false;
      const target = event.target as HTMLElement | null;
      if (!target || !view.dom.contains(target)) return false;
      // 터치한 편집 블록(문단·헤딩·제목) 또는 셀 — 종전엔 "현재 selection이 표 안일 때"로만
      // 제한했으나, 일반 문단↔문단 터치에서도 posAtCoords 왜곡이 노출되므로 제한을 제거했다.
      const block = target.closest("p, h1, h2, h3, h4, h5, h6, div[data-title], td, th");
      if (!block) return false;
      try {
        const pos = view.posAtDOM(block, 0);
        const sel = TextSelection.near(view.state.doc.resolve(pos), 1);
        view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
        return true;
      } catch {
        return false;
      }
    },
  };

  return { extensions, editorProps };
}
