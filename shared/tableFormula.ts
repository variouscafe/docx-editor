/**
 * 표 계산 엔진 — FE(미리보기 실시간 계산)·BE(DOCX 내보내기)가 공유하는 순수 로직.
 * 0 의존성. "미리보기 == DOCX 출력" 원칙: 포맷/수식 해석을 양쪽이 동일하게 구동.
 *
 * 두 축:
 *  1) 숫자 포맷(NumberFormat) — 천단위 콤마 / 금액(₩, 원) / 소수 / 백분율.
 *     로케일 무관·결정론적 그룹핑(항상 콤마 thousands, 점 decimals) → UI 언어와 무관하게
 *     미리보기와 DOCX 가 같은 문자열을 낸다.
 *  2) 수식(Formula) — 워드식 방향 연산(SUM(ABOVE)/AVERAGE(LEFT)/...) + 명시적 A1 범위(SUM(B2:B8)).
 *     함수: SUM/AVERAGE/COUNT/MAX/MIN. colspan/rowspan(병합 셀)까지 안전.
 */

import type { JSONContent } from "./runs";

/* ------------------------------------------------------------------ *
 * 숫자 포맷
 * ------------------------------------------------------------------ */

export type NumberFormat =
  | "number" // 1,234
  | "number2" // 1,234.00
  | "currency" // ₩1,234
  | "currencyWon" // 1,234원
  | "percent" // 12%
  | "percent1"; // 12.5%

export const NUMBER_FORMATS: readonly NumberFormat[] = [
  "number",
  "number2",
  "currency",
  "currencyWon",
  "percent",
  "percent1",
];

export function isNumberFormat(v: unknown): v is NumberFormat {
  return typeof v === "string" && (NUMBER_FORMATS as readonly string[]).includes(v);
}

/** 셀 텍스트 → 숫자. 통화기호/천단위 콤마/공백/괄호음수 표기까지 흡수. 파싱 불가 시 null. */
export function parseNumber(text: string | null | undefined): number | null {
  if (text == null) return null;
  let s = String(text).trim();
  if (s === "") return null;
  // 괄호 음수 표기: (1,234) → -1234
  const paren = /^\((.+)\)$/.exec(s);
  if (paren) s = "-" + paren[1];
  // 통화·단위 기호 / 천단위 콤마·전각콤마 / 공백 제거
  s = s.replace(/[₩$€£¥,，\s원%％]/g, "");
  if (s === "" || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 정수부 천단위 콤마 그룹핑(intPart 는 부호 없는 숫자열). */
function groupInteger(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 절댓값 고정소수 → 그룹핑(부호 없음). */
function fmtAbs(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, dec] = fixed.split(".");
  return groupInteger(intPart) + (dec ? "." + dec : "");
}

/** 값 → 포맷 문자열. 로케일 무관(항상 콤마/점). */
export function formatNumber(value: number, fmt: NumberFormat): string {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  switch (fmt) {
    case "number":
      return sign + fmtAbs(value, 0);
    case "number2":
      return sign + fmtAbs(value, 2);
    case "currency":
      return sign + "₩" + fmtAbs(value, 0);
    case "currencyWon":
      return sign + fmtAbs(value, 0) + "원";
    case "percent":
      return sign + fmtAbs(value, 0) + "%";
    case "percent1":
      return sign + fmtAbs(value, 1) + "%";
    default:
      return String(value);
  }
}

/** 일반 셀 텍스트에 포맷 적용 — 숫자로 파싱되면 포맷, 아니면 원문 그대로. */
export function renderFormattedText(
  text: string,
  format: string | null | undefined,
): string {
  if (!format || !isNumberFormat(format)) return text;
  const n = parseNumber(text);
  if (n === null) return text;
  return formatNumber(n, format);
}

/* ------------------------------------------------------------------ *
 * 셀 좌표(A1 표기)
 * ------------------------------------------------------------------ */

export interface CellRef {
  col: number; // 0-base
  row: number; // 0-base
}

export function colToLetters(col: number): string {
  let s = "";
  let c = col + 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export function lettersToCol(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return col - 1;
}

export function parseCellRef(ref: string): CellRef | null {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(ref.trim());
  if (!m) return null;
  const col = lettersToCol(m[1].toUpperCase());
  const row = parseInt(m[2], 10) - 1;
  if (row < 0 || col < 0) return null;
  return { col, row };
}

export function cellRefLabel(col: number, row: number): string {
  return `${colToLetters(col)}${row + 1}`;
}

/* ------------------------------------------------------------------ *
 * 수식 파싱
 * ------------------------------------------------------------------ */

export type FormulaFn = "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";
export type Direction = "ABOVE" | "BELOW" | "LEFT" | "RIGHT";

export const FORMULA_FNS: readonly FormulaFn[] = ["SUM", "AVERAGE", "COUNT", "MAX", "MIN"];
export const DIRECTIONS: readonly Direction[] = ["ABOVE", "BELOW", "LEFT", "RIGHT"];

export interface ParsedFormula {
  fn: FormulaFn;
  /** 방향 연산일 때. 인자가 없으면 기본 ABOVE. */
  direction: Direction;
  /** 명시적 A1 범위일 때(direction 보다 우선). */
  range?: { from: CellRef; to: CellRef };
}

const FN_ALIAS: Record<string, FormulaFn> = { AVG: "AVERAGE" };

export function parseFormula(formula: string | null | undefined): ParsedFormula | null {
  if (!formula) return null;
  const s = formula.trim().replace(/^=/, "").trim().toUpperCase();
  const m = /^([A-Z]+)\s*(?:\(([^)]*)\))?$/.exec(s);
  if (!m) return null;
  const fn = FN_ALIAS[m[1]] ?? (m[1] as FormulaFn);
  if (!(FORMULA_FNS as readonly string[]).includes(fn)) return null;
  const arg = (m[2] ?? "").trim().toUpperCase();

  // 명시적 범위: A1:B2 또는 단일 A1
  const rangeMatch = /^([A-Z]+[0-9]+)\s*:\s*([A-Z]+[0-9]+)$/.exec(arg);
  if (rangeMatch) {
    const from = parseCellRef(rangeMatch[1]);
    const to = parseCellRef(rangeMatch[2]);
    if (!from || !to) return null;
    return { fn, direction: "ABOVE", range: { from, to } };
  }
  const single = parseCellRef(arg);
  if (single) return { fn, direction: "ABOVE", range: { from: single, to: single } };

  // 방향 키워드(또는 생략 → ABOVE)
  const dir = (DIRECTIONS as readonly string[]).includes(arg) ? (arg as Direction) : "ABOVE";
  return { fn, direction: dir };
}

/* ------------------------------------------------------------------ *
 * 표 그리드(병합 셀 전개)
 * ------------------------------------------------------------------ */

export interface GridCell {
  row: number; // 논리 행(셀 좌상단)
  col: number; // 논리 열(셀 좌상단)
  rowSpan: number;
  colSpan: number;
  isHeader: boolean;
  text: string; // 셀 원문 텍스트
  value: number | null; // 파싱된 숫자
  format: string | null;
  formula: string | null;
}

export interface TableGrid {
  rows: number;
  cols: number;
  /** [row][col] → 셀(병합 영역은 같은 GridCell 객체로 채움). 빈 칸은 null. */
  matrix: (GridCell | null)[][];
  /** 고유 셀 목록(좌상단 기준). */
  cells: GridCell[];
}

/** 인라인 노드에서 텍스트 수집(개행 포함). */
function paraText(p: JSONContent): string {
  let out = "";
  const walk = (n: JSONContent): void => {
    if (n.type === "text") out += n.text ?? "";
    else if (n.type === "hardBreak") out += "\n";
    else for (const c of n.content ?? []) walk(c);
  };
  walk(p);
  return out;
}

/** 셀 노드 → 텍스트(단락을 개행으로 결합 후 trim). */
export function cellNodeText(cell: JSONContent): string {
  const parts: string[] = [];
  for (const child of cell.content ?? []) parts.push(paraText(child));
  return parts.join("\n").trim();
}

/**
 * 표(table>tableRow>(tableHeader|tableCell)>paragraph) 노드 → 논리 그리드.
 * colspan/rowspan 을 전개해 matrix 를 채운다. FE 미리보기·BE 내보내기 공용.
 */
export function buildTableGrid(table: JSONContent): TableGrid {
  const rowNodes = (table.content ?? []).filter((r) => r.type === "tableRow");
  const matrix: (GridCell | null)[][] = [];
  const cells: GridCell[] = [];
  let maxCols = 0;

  const ensureRow = (r: number): (GridCell | null)[] => {
    while (matrix.length <= r) matrix.push([]);
    return matrix[r];
  };

  rowNodes.forEach((rowNode, r) => {
    const rowCells = (rowNode.content ?? []).filter(
      (c) => c.type === "tableCell" || c.type === "tableHeader",
    );
    const matrixRow = ensureRow(r);
    let col = 0;
    for (const cn of rowCells) {
      while (matrixRow[col]) col++; // 다음 빈 열로
      const rowSpan = Math.max(1, Number(cn.attrs?.rowspan) || 1);
      const colSpan = Math.max(1, Number(cn.attrs?.colspan) || 1);
      const text = cellNodeText(cn);
      const cell: GridCell = {
        row: r,
        col,
        rowSpan,
        colSpan,
        isHeader: cn.type === "tableHeader",
        text,
        value: parseNumber(text),
        format: isNumberFormat(cn.attrs?.format) ? (cn.attrs!.format as NumberFormat) : null,
        formula:
          typeof cn.attrs?.formula === "string" && cn.attrs.formula.trim() !== ""
            ? cn.attrs.formula
            : null,
      };
      cells.push(cell);
      for (let dr = 0; dr < rowSpan; dr++) {
        const rr = ensureRow(r + dr);
        for (let dc = 0; dc < colSpan; dc++) {
          const cc = col + dc;
          while (rr.length <= cc) rr.push(null);
          rr[cc] = cell;
          if (cc + 1 > maxCols) maxCols = cc + 1;
        }
      }
      col += colSpan;
    }
  });

  // 모든 행을 maxCols 길이로 패딩.
  const padded = matrix.map((row) => {
    const out: (GridCell | null)[] = [];
    for (let c = 0; c < maxCols; c++) out[c] = row[c] ?? null;
    return out;
  });

  return { rows: rowNodes.length, cols: maxCols, matrix: padded, cells };
}

/* ------------------------------------------------------------------ *
 * 범위 수집 + 평가
 * ------------------------------------------------------------------ */

export type FormulaError = "parse" | "div0" | "ref";

export interface EvalResult {
  value: number | null;
  error?: FormulaError;
}

/** 수식 셀(origin) 기준으로 참조 셀들을 수집(중복/자기자신 제외). */
function collectRefs(
  parsed: ParsedFormula,
  grid: TableGrid,
  origin: GridCell,
): GridCell[] {
  const seen = new Set<GridCell>();
  const out: GridCell[] = [];
  const add = (c: GridCell | null): void => {
    if (c && c !== origin && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };

  if (parsed.range) {
    const r1 = Math.min(parsed.range.from.row, parsed.range.to.row);
    const r2 = Math.max(parsed.range.from.row, parsed.range.to.row);
    const c1 = Math.min(parsed.range.from.col, parsed.range.to.col);
    const c2 = Math.max(parsed.range.from.col, parsed.range.to.col);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) continue;
        add(grid.matrix[r]?.[c] ?? null);
      }
    }
    return out;
  }

  const or = origin.row;
  const oc = origin.col;
  const dir = parsed.direction;

  // 방향 연산: 같은 열/행을 따라 이동하며, 빈 칸은 스킵, 비숫자 텍스트에서 정지.
  // ABOVE 는 헤더 행에서 정지(헤더는 합계 대상 아님).
  if (dir === "ABOVE") {
    for (let r = or - 1; r >= 0; r--) {
      const c = grid.matrix[r]?.[oc] ?? null;
      if (!c) continue;
      if (c.isHeader) break;
      if (c.text === "") continue;
      if (c.value === null) break;
      add(c);
    }
  } else if (dir === "BELOW") {
    for (let r = or + 1; r < grid.rows; r++) {
      const c = grid.matrix[r]?.[oc] ?? null;
      if (!c) continue;
      if (c.text === "") continue;
      if (c.value === null) break;
      add(c);
    }
  } else if (dir === "LEFT") {
    for (let c = oc - 1; c >= 0; c--) {
      const cell = grid.matrix[or]?.[c] ?? null;
      if (!cell) continue;
      if (cell.text === "") continue;
      if (cell.value === null) break;
      add(cell);
    }
  } else {
    // RIGHT
    for (let c = oc + 1; c < grid.cols; c++) {
      const cell = grid.matrix[or]?.[c] ?? null;
      if (!cell) continue;
      if (cell.text === "") continue;
      if (cell.value === null) break;
      add(cell);
    }
  }
  return out;
}

/** 구조화된 수식(ParsedFormula) 평가 — 함수·범위/방향 핵심 로직. */
export function evaluateParsed(
  parsed: ParsedFormula,
  grid: TableGrid,
  origin: GridCell,
): EvalResult {
  const refs = collectRefs(parsed, grid, origin);
  const nums = refs.map((c) => c.value).filter((v): v is number => v !== null);
  switch (parsed.fn) {
    case "SUM":
      return { value: nums.reduce((a, b) => a + b, 0) };
    case "AVERAGE":
      if (nums.length === 0) return { value: null, error: "div0" };
      return { value: nums.reduce((a, b) => a + b, 0) / nums.length };
    case "COUNT":
      return { value: nums.length };
    case "MAX":
      return nums.length ? { value: Math.max(...nums) } : { value: null };
    case "MIN":
      return nums.length ? { value: Math.min(...nums) } : { value: null };
  }
}

/** 함수형 수식(SUM(ABOVE), =SUM(B2:B8) 등) 평가 — parse + evaluateParsed. */
export function evaluateFormula(
  formula: string | null | undefined,
  grid: TableGrid,
  origin: GridCell,
): EvalResult {
  const parsed = parseFormula(formula);
  if (!parsed) return { value: null, error: "parse" };
  return evaluateParsed(parsed, grid, origin);
}

/* ------------------------------------------------------------------ *
 * 사칙연산 표현식 엔진(=A1+B1*0.1, =(A1+A2)/2, =SUM(B2:B8)*1.1 ...)
 * 재귀하강 파서. 연산자 우선순위: * / > + - > 단항 -. 괄호 지원.
 * 피연산자: 숫자 / 셀참조(A1) / 함수호출(SUM(...)). 함수호출은 방향·A1범위 모두 허용.
 * 비숫자 셀은 0 으로 취급(스프레드시트 관례). 0 나눗셈 → div0.
 * ------------------------------------------------------------------ */

class CalcError extends Error {
  code: FormulaError;
  constructor(code: FormulaError) {
    super(code);
    this.code = code;
  }
}

type Token =
  | { t: "num"; v: number }
  | { t: "cell"; ref: CellRef }
  | { t: "ident"; name: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "colon" };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (ch === ":") {
      out.push({ t: "colon" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === ".") {
        j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new CalcError("parse");
      out.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      const letters = s.slice(i, j);
      // 글자 뒤 숫자가 오면 셀참조(A1), 아니면 식별자(함수명/방향키워드).
      if (j < s.length && /[0-9]/.test(s[j])) {
        let k = j;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        const ref = parseCellRef(s.slice(i, k));
        if (!ref) throw new CalcError("parse");
        out.push({ t: "cell", ref });
        i = k;
        continue;
      }
      out.push({ t: "ident", name: letters });
      i = j;
      continue;
    }
    throw new CalcError("parse");
  }
  return out;
}

interface FuncArg {
  direction?: Direction;
  range?: { from: CellRef; to: CellRef };
}

/** 셀참조 → 숫자(비숫자/빈 셀은 0). */
function cellNum(ref: CellRef, grid: TableGrid): number {
  const c = grid.matrix[ref.row]?.[ref.col];
  return c?.value ?? 0;
}

/** 표현식 내 함수호출 평가 → 숫자. 방향·A1범위 인자 재사용. */
function evalFuncCall(
  name: string,
  arg: FuncArg,
  grid: TableGrid,
  origin: GridCell,
): number {
  const fn = FN_ALIAS[name] ?? name;
  if (!(FORMULA_FNS as readonly string[]).includes(fn)) throw new CalcError("parse");
  const parsed: ParsedFormula = {
    fn,
    direction: arg.direction ?? "ABOVE",
    range: arg.range,
  };
  const res = evaluateParsed(parsed, grid, origin);
  if (res.error === "div0") throw new CalcError("div0");
  return res.value ?? 0;
}

/** 사칙연산 표현식 평가. */
export function evaluateExpression(
  raw: string | null | undefined,
  grid: TableGrid,
  origin: GridCell,
): EvalResult {
  try {
    const s = (raw ?? "").trim().replace(/^=/, "").trim();
    if (s === "") return { value: null, error: "parse" };
    const tokens = tokenize(s);
    let i = 0;
    const peek = (): Token | undefined => tokens[i];
    const eat = (): Token | undefined => tokens[i++];
    const expectType = (t: Token["t"]): void => {
      const tk = eat();
      if (!tk || tk.t !== t) throw new CalcError("parse");
    };

    const parseExpr = (): number => {
      let v = parseTerm();
      for (;;) {
        const tk = peek();
        if (tk?.t === "op" && (tk.v === "+" || tk.v === "-")) {
          eat();
          const r = parseTerm();
          v = tk.v === "+" ? v + r : v - r;
        } else break;
      }
      return v;
    };
    const parseTerm = (): number => {
      let v = parseFactor();
      for (;;) {
        const tk = peek();
        if (tk?.t === "op" && (tk.v === "*" || tk.v === "/")) {
          eat();
          const r = parseFactor();
          if (tk.v === "/") {
            if (r === 0) throw new CalcError("div0");
            v = v / r;
          } else v = v * r;
        } else break;
      }
      return v;
    };
    const parseFactor = (): number => {
      const tk = peek();
      if (tk?.t === "op" && tk.v === "-") {
        eat();
        return -parseFactor();
      }
      if (tk?.t === "op" && tk.v === "+") {
        eat();
        return parseFactor();
      }
      return parsePrimary();
    };
    const parsePrimary = (): number => {
      const tk = peek();
      if (!tk) throw new CalcError("parse");
      if (tk.t === "num") {
        eat();
        return tk.v;
      }
      if (tk.t === "cell") {
        eat();
        return cellNum(tk.ref, grid);
      }
      if (tk.t === "lp") {
        eat();
        const v = parseExpr();
        expectType("rp");
        return v;
      }
      if (tk.t === "ident") {
        eat();
        if (peek()?.t === "lp") {
          eat(); // (
          const arg = parseArg();
          expectType("rp");
          return evalFuncCall(tk.name.toUpperCase(), arg, grid, origin);
        }
        // 단독 식별자(방향/함수명)는 값 아님 → 오류.
        throw new CalcError("parse");
      }
      throw new CalcError("parse");
    };
    const parseArg = (): FuncArg => {
      const tk = peek();
      if (tk?.t === "ident") {
        const up = tk.name.toUpperCase();
        if ((DIRECTIONS as readonly string[]).includes(up)) {
          eat();
          return { direction: up as Direction };
        }
      }
      if (tk?.t === "cell") {
        eat();
        if (peek()?.t === "colon") {
          eat();
          const t2 = eat();
          if (!t2 || t2.t !== "cell") throw new CalcError("parse");
          return { range: { from: tk.ref, to: t2.ref } };
        }
        return { range: { from: tk.ref, to: tk.ref } };
      }
      throw new CalcError("parse");
    };

    const result = parseExpr();
    if (i < tokens.length) throw new CalcError("parse"); // 잉여 토큰
    if (!Number.isFinite(result)) return { value: null, error: "parse" };
    return { value: result };
  } catch (e) {
    if (e instanceof CalcError) return { value: null, error: e.code };
    return { value: null, error: "parse" };
  }
}

/** 순수 함수형 수식(SUM(...) 또는 SUM)인지 — 그렇지 않으면 산술 표현식 경로. */
export function isFunctionFormula(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim().replace(/^=/, "").trim();
  return /^[A-Za-z]+\s*(\([^)]*\))?$/.test(t);
}

/** 수식 통합 평가 — 함수형이면 evaluateParsed, 아니면 산술 표현식. */
export function evaluateAny(
  formula: string | null | undefined,
  grid: TableGrid,
  origin: GridCell,
): EvalResult {
  if (isFunctionFormula(formula)) {
    const parsed = parseFormula(formula);
    if (parsed) return evaluateParsed(parsed, grid, origin);
  }
  return evaluateExpression(formula, grid, origin);
}

/** 에러 코드 → 로케일 중립 표시(엑셀 유사). */
export function formulaErrorText(error: FormulaError): string {
  switch (error) {
    case "parse":
      return "#FORMULA!";
    case "div0":
      return "#DIV/0!";
    case "ref":
      return "#REF!";
  }
}

/**
 * 셀의 표시 텍스트 계산 — 수식 셀이면 평가+포맷, 포맷 셀이면 숫자포맷, 아니면 원문.
 * FE 미리보기·BE DOCX 가 같은 값을 쓴다.
 */
export function formatCellValue(cell: GridCell, grid: TableGrid): string {
  if (cell.formula) {
    const { value, error } = evaluateAny(cell.formula, grid, cell);
    if (error) return formulaErrorText(error);
    if (value === null) return "";
    const fmt: NumberFormat = isNumberFormat(cell.format) ? cell.format : "number";
    return formatNumber(value, fmt);
  }
  if (cell.format && isNumberFormat(cell.format)) {
    if (cell.value === null) return cell.text;
    return formatNumber(cell.value, cell.format);
  }
  return cell.text;
}
