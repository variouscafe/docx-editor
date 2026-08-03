/**
 * RunData — FE(마크다운 직렬화)·BE(docx 생성)가 공유하는 인라인 실행 단위 모델.
 * docx 의존성을 갖지 않는다(border 스타일은 문자열로 표현).
 */

/** ProseMirror/TipTap 문서 노드의 구조적 타입(zero-dep). TipTap 의 JSONContent 와 구조 호환. */
export interface JSONContent {
  type?: string;
  attrs?: Record<string, any>;
  content?: JSONContent[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
  [key: string]: any;
}

export type RunBorderStyle = "solid" | "dashed";

export interface RunBorder {
  style: RunBorderStyle;
  color: string;
}

export interface RunData {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  border?: RunBorder;
  annotation?: string;
  coreSummary?: boolean;
  highlight?: string; // hex color (#RRGGBB)
  fontSize?: number; // pt — fontSize mark 에서 옴
  break?: boolean; // 단락 내 줄바꿈(hardBreak)
}

/** runs 에서 텍스트를 합치되 break 는 \n 으로 변환 (CONTENT_BRACKET 감싸기 등에 사용). */
export function getTextContentFromRuns(runs: RunData[]): string {
  return runs.map((r) => (r.break ? "\n" : r.text)).join("");
}

/** runs 중 hardBreak 가 하나라도 있는지 (h4 단일/다중 줄 판별 등). */
export function hasBreak(runs: RunData[]): boolean {
  return runs.some((r) => r.break);
}
