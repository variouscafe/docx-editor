import type { DocxOptions } from "@shared/options";
import { resolveSpacing } from "@shared/options";
import { highlightColors } from "../Editor/extensions/highlightColors";

/**
 * 미리보기(A4 문서)용 CSS 생성. DocxPreview 가 렌더하는 <style> 에 주입된다.
 * DocxOptions(간격·폰트·색)와 editable(편집/공유 보기 전환)만 받는 순수 함수 —
 * 훅/상태에 의존하지 않으므로 DocxPreview 컴포넌트에서 분리해도 결합도 0.
 * 간격은 DOCX 출력(resolveSpacing, @shared/options)과 동일 로직 → 미리보기 == DOCX.
 */
export function getPreviewStyles(options: DocxOptions, editable: boolean): string {
  // 정규화된 간격(줄 간격/단락 앞/단락 뒤) — DOCX 와 동일 로직(resolveSpacing).
  const sc = resolveSpacing(options.common).css;
  const st = resolveSpacing(options.title).css;
  const sh: Record<number, ReturnType<typeof resolveSpacing>["css"]> = {
    1: resolveSpacing(options.h1).css,
    2: resolveSpacing(options.h2).css,
    3: resolveSpacing(options.h3).css,
    4: resolveSpacing(options.h4).css,
    5: resolveSpacing(options.h5).css,
    6: resolveSpacing(options.h6).css,
  };
  const sa2 = resolveSpacing(options.annotation2).css;
  return `
    .rm-with-pagination {
      background: #ffffff !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }

    .rm-with-pagination.ProseMirror {
      word-break: keep-all;
      overflow-wrap: break-word;
      line-height: 1.6;
      font-family: ${options.common.fontFamily} !important;
    }

    /* 공통 폰트를 문서 전체(제목·헤딩·본문)에 명시 적용 — 상속에만 의존하지 않도록. */
    .rm-with-pagination [data-title],
    .rm-with-pagination.ProseMirror h1,
    .rm-with-pagination.ProseMirror h2,
    .rm-with-pagination.ProseMirror h3,
    .rm-with-pagination.ProseMirror h4,
    .rm-with-pagination.ProseMirror h5,
    .rm-with-pagination.ProseMirror h6,
    .rm-with-pagination.ProseMirror p {
      font-family: ${options.common.fontFamily} !important;
    }

    .rm-with-pagination.ProseMirror:focus {
      outline: none;
    }

    .rm-with-pagination .rm-pagination-gap {
      background-color: var(--preview-gap) !important;
    }

    /* 제목: 20pt, 굵게, 밑줄, 가운데 정렬 */
    .rm-with-pagination [data-title] {
      font-size: ${options.title.fontSize}pt;
      font-weight: ${options.title.bold ? 700 : 400};
      text-align: ${options.title.align};
      text-decoration: ${options.title.underline ? "underline" : "none"};
      margin-top: ${st.marginTop};
      margin-bottom: ${st.marginBottom};
      line-height: ${st.lineHeight};
    }

    .rm-with-pagination h1 {
      font-size: ${options.h1.fontSize}pt;
      font-weight: ${options.h1.bold ? 700 : 400};
      margin-top: ${sh[1].marginTop};
      margin-bottom: ${sh[1].marginBottom};
      line-height: ${sh[1].lineHeight};
    }

    .rm-with-pagination h2 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[2].marginTop};
      margin-bottom: ${sh[2].marginBottom};
      line-height: ${sh[2].lineHeight};
    }

    .rm-with-pagination h3 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[3].marginTop};
      margin-bottom: ${sh[3].marginBottom};
      line-height: ${sh[3].lineHeight};
    }

    .rm-with-pagination h4 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[4].marginTop};
      margin-bottom: ${sh[4].marginBottom};
      line-height: ${sh[4].lineHeight};
    }

    .rm-with-pagination h5 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[5].marginTop};
      margin-bottom: ${sh[5].marginBottom};
      line-height: ${sh[5].lineHeight};
    }

    .rm-with-pagination h6 {
      font-size: ${options.common.fontSize}pt;
      font-weight: 400;
      margin-top: ${sh[6].marginTop};
      margin-bottom: ${sh[6].marginBottom};
      line-height: ${sh[6].lineHeight};
    }

    .rm-with-pagination p {
      font-size: ${options.common.fontSize}pt;
      margin-top: ${sc.marginTop};
      margin-bottom: ${sc.marginBottom};
      line-height: ${sc.lineHeight};
    }

    /* 굵은 기호(1., 1), □, Ⅰ) 헤딩 — 기호+본문 모두 굵게(docx 와 일치) */
    .rm-with-pagination [data-bold-symbol="true"] {
      font-weight: 700 !important;
    }

    ${
      editable
        ? `
    /* 워드 스타일 엔터 기호(¶) 표시 — 편집 모드(미리보기)에서만. 공유 보기에서는 숨김.
       줄바꿈(Enter)으로 생긴 모든 문단/헤딩 끝에 항상 ¶가 표시된다. */
    .rm-with-pagination.ProseMirror p::after,
    .rm-with-pagination.ProseMirror h1::after,
    .rm-with-pagination.ProseMirror h2::after,
    .rm-with-pagination.ProseMirror h3::after,
    .rm-with-pagination.ProseMirror h4::after,
    .rm-with-pagination.ProseMirror h5::after,
    .rm-with-pagination.ProseMirror h6::after {
      content: "¶" !important;
      display: inline !important;
      color: #b0b0b0 !important;
      font-size: 0.75em !important;
      margin-left: 1px !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    /* 빈 문단/헤딩(내용 없이 trailingBreak <br>만 있는 경우)에도 ¶를 항상 표시한다.
       단, 빈 문단의 ::after ¶는 <br> 뒤로 밀려 별도 줄에 렌더되어 "커서 1줄 + ¶ 1줄 = 2줄"
       phantom 라인이 생기므로, ::after는 끄고 대신 ::before로 ¶를 커서가 있는 첫 줄에
       inline 표시한다. (내용이 있는 문단은 위 ::after로 끝에 표시 → 워드의 ¶ 토글과 동일.) */
    .rm-with-pagination.ProseMirror p:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h1:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h2:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h3:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h4:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h5:has(> br.ProseMirror-trailingBreak:only-child)::after,
    .rm-with-pagination.ProseMirror h6:has(> br.ProseMirror-trailingBreak:only-child)::after {
      content: none !important;
    }
    .rm-with-pagination.ProseMirror p:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h1:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h2:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h3:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h4:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h5:has(> br.ProseMirror-trailingBreak:only-child)::before,
    .rm-with-pagination.ProseMirror h6:has(> br.ProseMirror-trailingBreak:only-child)::before {
      content: "¶" !important;
      display: inline !important;
      color: #b0b0b0 !important;
      font-size: 0.75em !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    /* 강제 줄바꿈(hardBreak, Shift+Enter) ↵ 기호 — 위젯 Decoration 으로 삽입. 편집 모드에서만. */
    .rm-with-pagination .rm-hardbreak-mark {
      display: inline;
      color: #b0b0b0 !important;
      font-size: 0.75em !important;
      pointer-events: none !important;
      user-select: none !important;
    }
    `
        : ""
    }

    .rm-with-pagination [data-border="solid"] {
      display: block;
      border: 1.5px solid #333;
      padding: 12px 16px;
      margin: 8px 0;
      border-radius: 2px;
    }

    .rm-with-pagination [data-border="dashed"] {
      display: block;
      border: 1.5px dashed #666;
      padding: 12px 16px;
      margin: 8px 0;
      border-radius: 2px;
    }

    .rm-with-pagination mark {
      border-radius: 2px;
      padding: 0 2px;
    }

    /* 꼬마글씨 Mode 1: floating annotation layer */
    .rm-with-pagination [data-annotation] {
      position: relative;
      display: inline;
    }
    .rm-with-pagination [data-annotation]::after {
      content: attr(data-annotation);
      position: absolute;
      left: 0;
      top: 100%;
      font-size: ${options.annotation1.fontSize}pt;
      font-family: ${options.annotation1.fontFamily};
      color: ${options.annotation1.color};
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
    }

    /* 꼬마글씨 Mode 2: 블록 뒤 위젯으로 렌더(Decoration) */
    .rm-with-pagination [data-annotation-paragraph] {
      font-size: ${options.annotation2.fontSize}pt;
      font-family: ${options.common.fontFamily} !important;
      margin-top: ${sa2.marginTop};
      margin-bottom: ${sa2.marginBottom};
      line-height: ${sa2.lineHeight};
      color: #333;
    }

    /* 핵심요약: [ ] 괄호 형태 */
    .rm-with-pagination [data-core-summary] {
      display: block;
      border-left: 2px solid #333;
      border-right: 2px solid #333;
      padding: 8px 12px;
      margin: 8px 0;
      position: relative;
    }
    .rm-with-pagination [data-core-summary]::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }
    .rm-with-pagination [data-core-summary]::after {
      content: "";
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(to right, #333 12px, transparent 12px, transparent calc(100% - 12px), #333 calc(100% - 12px));
    }

    ${
      editable
        ? `
    /* 텍스트 선택 시 파란색 하이라이트 — 편집 모드에서만 */
    .rm-with-pagination.ProseMirror ::selection {
      background: var(--preview-accent);
      color: #ffffff;
    }
    .rm-with-pagination.ProseMirror::selection {
      background: var(--preview-accent);
      color: #ffffff;
    }

    /* 문단 호버 시 연한 파란색 박스 — 편집 모드에서만 */
    .rm-with-pagination.ProseMirror > h1:hover,
    .rm-with-pagination.ProseMirror > h2:hover,
    .rm-with-pagination.ProseMirror > h3:hover,
    .rm-with-pagination.ProseMirror > h4:hover,
    .rm-with-pagination.ProseMirror > h5:hover,
    .rm-with-pagination.ProseMirror > h6:hover,
    .rm-with-pagination.ProseMirror > p:hover,
    .rm-with-pagination.ProseMirror > div[data-title]:hover {
      background-color: color-mix(in oklch, var(--preview-accent) 8%, transparent);
      outline: 1px solid color-mix(in oklch, var(--preview-accent) 20%, transparent);
      outline-offset: -1px;
      border-radius: 2px;
      cursor: pointer;
    }

    /* 클릭 선택 시 파란색 박스 — 편집 모드에서만 */
    .rm-with-pagination.ProseMirror > .preview-block-selected,
    .rm-with-pagination.ProseMirror > .preview-block-selected:hover {
      background-color: color-mix(in oklch, var(--preview-accent) 12%, transparent);
      outline: 2px solid color-mix(in oklch, var(--preview-accent) 40%, transparent);
      outline-offset: -1px;
      border-radius: 2px;
    }
    `
        : `
    /* 공유(보기 전용) 모드: 텍스트 선택 하이라이트와 블록 박스를 모두 숨겨
       정적인 문서처럼 보이도록 한다 (엔터 기호 ¶도 표시 안 함). */
    .rm-with-pagination.ProseMirror ::selection,
    .rm-with-pagination.ProseMirror::selection {
      background: transparent !important;
      color: inherit !important;
    }
    `
    }

    /* 표 스타일 — 행 단위 페이지 분할(워드-like).
       table/tbody 를 display:contents 로 펴고 각 <tr> 를 flex 컨테이너로 렌더 →
       MeasurePagination 의 페이지나눔 위젯이 행 사이에 자연 끼임. 열은 flex 균등 분할.
       테두리는 border-collapse 대신 각 셀 border + 음수 margin 겹침 보정.
       (display:table 모드에선 위젯이 tr 사이에 못 끼어들어 행 분할이 불가 → 이 방식.) */
    .rm-with-pagination .tableWrapper {
      /* visible: 행 분할 위젯(gap)이 음수 margin 으로 좌우 여백까지 확장해 100% 분절.
         auto 면 위젯이 tableWrapper 너비를 초과해 가로 스크롤 유발. (표 자체가 content 보다
         넓은 경우만 에디터 가로 스크롤 — 일반 양식에선 표가 content 에 맞음.) */
      overflow-x: visible;
      margin: 8px 0;
    }
    .rm-with-pagination table {
      display: contents !important;
      font-family: ${options.common.fontFamily} !important;
    }
    .rm-with-pagination table tbody {
      display: contents !important;
    }
    .rm-with-pagination table tr {
      display: flex !important;
      width: 100% !important;
      break-inside: avoid;
    }
    .rm-with-pagination table td,
    .rm-with-pagination table th {
      flex: 1 1 0;
      min-width: 50px;
      border: 1px solid #333;
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
      position: relative;
      /* 인접 셀 테두리 겹침 보정(border-collapse 흉내). */
      margin-left: -1px;
      margin-top: -1px;
      /* 모바일: 세로 스크롤(pan-y)은 브라우저에 맡기고, 가로 드래그만 셀 범위 선택으로
         처리(tableCellDragSelect 가 방향 판별). touch-action:none 이면 표 위에서 문서
         스크롤 자체가 불가해지므로 pan-y 로 완화 — 세로 드래그=스크롤, 가로 드래그=선택. */
      touch-action: pan-y;
    }
    .rm-with-pagination table tr > td:first-child,
    .rm-with-pagination table tr > th:first-child {
      margin-left: 0;
    }
    /* 첫 행 상단 테두리 보정 — margin-top:-1px 이 첫 행(헤더) 위쪽 라인을 잘라먹지 않도록. */
    .rm-with-pagination table tr:first-child > td,
    .rm-with-pagination table tr:first-child > th {
      margin-top: 0;
    }
    .rm-with-pagination table th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
    /* 셀 배경음영 — data-background 색을 팔레트에서 매핑(th 기본 음영보다 우선) */
    ${highlightColors
      .map(
        (hc) =>
          `.rm-with-pagination td[data-background="${hc.color}"], .rm-with-pagination th[data-background="${hc.color}"] { background-color: ${hc.color} !important; }`,
      )
      .join("\n    ")}

    /* 계산식 셀(formula) — 계산된(읽기전용) 셀임을 표시. 옅은 강조 + 우상단 ƒ 배지. */
    .rm-with-pagination td[data-formula],
    .rm-with-pagination th[data-formula] {
      background-color: color-mix(in oklch, var(--preview-accent) 6%, transparent) !important;
    }
    .rm-with-pagination td[data-formula]::after,
    .rm-with-pagination th[data-formula]::after {
      content: "ƒ";
      position: absolute;
      top: 1px;
      right: 3px;
      font-size: 9px;
      font-style: italic;
      color: color-mix(in oklch, var(--preview-accent) 70%, #888);
      pointer-events: none;
      user-select: none;
      line-height: 1;
    }

    /* 계산(format/formula) 셀 기본 우측 정렬 — DOCX 출력(금액 관례)과 동일.
       단락에 명시적 text-align이 있으면 인라인 style 이 상속값을 이기므로 사용자 정렬 우선.
       (rowspan 표 셀 규칙이 우선순위가 높아 별도 셀렉터 추가 — !important 는 인라인 정렬을
       덮어써버려 쓰지 않는다.) */
    .rm-with-pagination td[data-format],
    .rm-with-pagination th[data-format],
    .rm-with-pagination td[data-formula],
    .rm-with-pagination th[data-formula] {
      text-align: right;
    }
    .rm-with-pagination .rm-table-rowspan table td[data-format],
    .rm-with-pagination .rm-table-rowspan table th[data-format],
    .rm-with-pagination .rm-table-rowspan table td[data-formula],
    .rm-with-pagination .rm-table-rowspan table th[data-formula] {
      text-align: right;
    }
    .rm-with-pagination table .selectedCell::after {
      z-index: 2;
      position: absolute;
      content: "";
      left: 0; right: 0; top: 0; bottom: 0;
      background: color-mix(in oklch, var(--preview-accent) 15%, transparent);
      pointer-events: none;
    }
    .rm-with-pagination table .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: -2px;
      width: 4px;
      background-color: var(--preview-accent);
      pointer-events: none;
    }

    /* rowspan(세로 병합) 포함 표: 진짜 테이블 레이아웃으로 전환(rowspan 시각 지원).
       일반 표(display:contents + flex 행)는 rowspan 을 시각적으로 표현 못하고 열 정렬이
       깨진다. rowspan 셀이 있는 표는 table/table-row/table-cell 강제 + border-collapse.
       페이지 분할은 통째(한 페이지에 배치, break-inside: avoid). 열 너비는 colgroup 담당. */
    .rm-with-pagination .rm-table-rowspan { break-inside: avoid; }
    .rm-with-pagination .rm-table-rowspan table {
      display: table !important;
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }
    .rm-with-pagination .rm-table-rowspan table tbody { display: table-row-group !important; }
    .rm-with-pagination .rm-table-rowspan table tr {
      display: table-row !important;
      width: auto !important;
    }
    .rm-with-pagination .rm-table-rowspan table td,
    .rm-with-pagination .rm-table-rowspan table th {
      display: table-cell !important;
      flex: initial; /* 기존 flex:1 1 0 무효화 */
      min-width: 50px;
      margin: 0; /* 기존 음수 margin(테두리 겹침 보정) 제거 — border-collapse 가 처리 */
      border: 1px solid #333;
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
      position: relative;
    }
  `;
}
