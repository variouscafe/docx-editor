import { describe, it, expect } from "vitest";
import {
  parseNumber,
  formatNumber,
  renderFormattedText,
  parseCellRef,
  cellRefLabel,
  colToLetters,
  lettersToCol,
  parseFormula,
  buildTableGrid,
  evaluateFormula,
  evaluateExpression,
  evaluateAny,
  isFunctionFormula,
  formatCellValue,
  isNumberFormat,
} from "./tableFormula";
import type { JSONContent } from "./runs";

/* ---------------- 숫자 파싱/포맷 ---------------- */

describe("parseNumber — 통화/콤마/괄호음수 흡수", () => {
  it("정수/소수/음수", () => {
    expect(parseNumber("10000")).toBe(10000);
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("-50")).toBe(-50);
    expect(parseNumber("3.14")).toBeCloseTo(3.14);
  });
  it("통화·단위 기호/공백 제거", () => {
    expect(parseNumber("₩10,000")).toBe(10000);
    expect(parseNumber("10,000원")).toBe(10000);
    expect(parseNumber("  1,234  ")).toBe(1234);
    expect(parseNumber("12%")).toBe(12);
  });
  it("괄호 음수 표기", () => {
    expect(parseNumber("(1,234)")).toBe(-1234);
  });
  it("빈 문자열/비숫자 → null", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("formatNumber — 로케일 무관 그룹핑", () => {
  it("천단위 콤마", () => {
    expect(formatNumber(10000, "number")).toBe("10,000");
    expect(formatNumber(1234567, "number")).toBe("1,234,567");
    expect(formatNumber(0, "number")).toBe("0");
  });
  it("소수 2자리", () => {
    expect(formatNumber(1234.5, "number2")).toBe("1,234.50");
    expect(formatNumber(1234, "number2")).toBe("1,234.00");
  });
  it("통화 ₩ / 원 접미사", () => {
    expect(formatNumber(10000, "currency")).toBe("₩10,000");
    expect(formatNumber(10000, "currencyWon")).toBe("10,000원");
  });
  it("음수 부호", () => {
    expect(formatNumber(-1234, "number")).toBe("-1,234");
    expect(formatNumber(-1234, "currency")).toBe("-₩1,234");
    expect(formatNumber(-1234, "currencyWon")).toBe("-1,234원");
  });
  it("백분율", () => {
    expect(formatNumber(12, "percent")).toBe("12%");
    expect(formatNumber(12.5, "percent1")).toBe("12.5%");
  });
});

describe("renderFormattedText — 비숫자는 원문 보존", () => {
  it("숫자는 포맷", () => {
    expect(renderFormattedText("10000", "currency")).toBe("₩10,000");
    expect(renderFormattedText("10000", "number")).toBe("10,000");
  });
  it("비숫자/포맷 없음은 원문", () => {
    expect(renderFormattedText("홍길동", "currency")).toBe("홍길동");
    expect(renderFormattedText("10000", null)).toBe("10000");
  });
});

/* ---------------- A1 좌표 ---------------- */

describe("A1 좌표 변환", () => {
  it("colToLetters / lettersToCol", () => {
    expect(colToLetters(0)).toBe("A");
    expect(colToLetters(25)).toBe("Z");
    expect(colToLetters(26)).toBe("AA");
    expect(lettersToCol("A")).toBe(0);
    expect(lettersToCol("Z")).toBe(25);
    expect(lettersToCol("AA")).toBe(26);
  });
  it("parseCellRef", () => {
    expect(parseCellRef("A1")).toEqual({ col: 0, row: 0 });
    expect(parseCellRef("C4")).toEqual({ col: 2, row: 3 });
    expect(parseCellRef("a1")).toEqual({ col: 0, row: 0 }); // 소문자
    expect(parseCellRef("AA1")).toEqual({ col: 26, row: 0 }); // 27번째 열
    expect(parseCellRef("x")).toBeNull();
  });
  it("cellRefLabel", () => {
    expect(cellRefLabel(0, 0)).toBe("A1");
    expect(cellRefLabel(2, 3)).toBe("C4");
  });
});

/* ---------------- 수식 파싱 ---------------- */

describe("parseFormula", () => {
  it("방향(생략 → ABOVE)", () => {
    expect(parseFormula("SUM(ABOVE")).toBeNull(); // 괄호 미닫힘
    expect(parseFormula("SUM(ABOVE)")).toEqual({ fn: "SUM", direction: "ABOVE" });
    expect(parseFormula("=SUM(LEFT)")).toEqual({ fn: "SUM", direction: "LEFT" });
    expect(parseFormula("sum")).toEqual({ fn: "SUM", direction: "ABOVE" });
  });
  it("AVG 별칭 → AVERAGE", () => {
    expect(parseFormula("AVG(ABOVE)")).toEqual({ fn: "AVERAGE", direction: "ABOVE" });
  });
  it("명시적 A1 범위 / 단일 셀", () => {
    expect(parseFormula("SUM(B2:B8)")).toEqual({
      fn: "SUM",
      direction: "ABOVE",
      range: { from: { col: 1, row: 1 }, to: { col: 1, row: 7 } },
    });
    expect(parseFormula("MAX(A1)")!.range).toEqual({
      from: { col: 0, row: 0 },
      to: { col: 0, row: 0 },
    });
  });
  it("지원 않는 함수/형태 → null", () => {
    expect(parseFormula("MEDIAN(A1:A3)")).toBeNull();
    expect(parseFormula("garbage")).toBeNull();
    expect(parseFormula(null)).toBeNull();
  });
});

/* ---------------- 그리드 + 평가 ---------------- */

/** 텍스트 셀 노드 헬퍼. */
function cell(text: string, extra?: Record<string, unknown>): JSONContent {
  return { type: "tableCell", attrs: extra, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}
function row(...cells: JSONContent[]): JSONContent {
  return { type: "tableRow", content: cells };
}
function table(...rows: JSONContent[]): JSONContent {
  return { type: "table", content: rows };
}

describe("buildTableGrid — 병합 셀 전개", () => {
  it("단순 3x3 그리드", () => {
    const g = buildTableGrid(
      table(
        row(cell("항목"), cell("금액")),
        row(cell("A"), cell("100")),
        row(cell("B"), cell("200")),
      ),
    );
    expect(g.rows).toBe(3);
    expect(g.cols).toBe(2);
    expect(g.matrix[2][1]?.value).toBe(200);
    expect(g.cells.length).toBe(6);
  });
  it("colspan 전개 — 같은 셀 객체가 여러 칸을 채움", () => {
    const g = buildTableGrid(
      table(
        row({ type: "tableCell", attrs: { colspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "합계" }] }] }, cell("100")),
        row(cell("A"), cell("100"), cell("200")),
      ),
    );
    expect(g.cols).toBe(3);
    // (0,0)과 (0,1)은 같은 병합 셀
    expect(g.matrix[0][0]).toBe(g.matrix[0][1]);
    // (0,2)는 "100", (1,2)는 "200"
    expect(g.matrix[0][2]?.value).toBe(100);
    expect(g.matrix[1][2]?.value).toBe(200);
  });
});

describe("evaluateFormula — 방향 연산", () => {
  const g = buildTableGrid(
    table(
      row(cell("항목"), cell("금액")),
      row(cell("A"), cell("100")),
      row(cell("B"), cell("200")),
      row(cell("C"), cell("300")),
    ),
  );

  it("SUM(ABOVE) — 헤더 제외한 위쪽 숫자 합", () => {
    const origin = g.matrix[3][1]!; // 마지막 행 금액칸
    // 합계 셀로 가정: origin 을 합계 위치로 두기 위해 (3,1)의 값을 무시하고 평가
    expect(evaluateFormula("SUM(ABOVE)", g, origin).value).toBe(100 + 200);
  });
  it("헤더 행에서 정지(헤더 텍스트는 숫자 아님 → break)", () => {
    // (1,1)=100 만 위에 숫자 아닌 헤더
    const origin = g.matrix[1][1]!;
    expect(evaluateFormula("SUM(ABOVE)", g, origin).value).toBe(0);
  });
  it("AVERAGE(ABOVE)", () => {
    const origin = g.matrix[3][1]!;
    expect(evaluateFormula("AVERAGE(ABOVE)", g, origin).value).toBe(150); // (100+200)/2
  });
  it("COUNT(ABOVE)", () => {
    const origin = g.matrix[3][1]!;
    expect(evaluateFormula("COUNT(ABOVE)", g, origin).value).toBe(2);
  });
  it("MAX/MIN(ABOVE)", () => {
    const origin = g.matrix[3][1]!;
    expect(evaluateFormula("MAX(ABOVE)", g, origin).value).toBe(200);
    expect(evaluateFormula("MIN(ABOVE)", g, origin).value).toBe(100);
  });
});

describe("evaluateFormula — 소계(위쪽 formula) 셀 이중 계산 방지", () => {
  // 헤더 + 100 + 200 + 소계(SUM(ABOVE)=300) + 총합(SUM(ABOVE))
  // 총합은 소계의 표시값(300)을 다시 더하지 않고 데이터만 합산 → 300(=100+200).
  const g = buildTableGrid(
    table(
      row(cell("항목"), cell("금액")),
      row(cell("A"), cell("100")),
      row(cell("B"), cell("200")),
      row(cell("소계"), cell("0", { formula: "SUM(ABOVE)", format: "currency" })),
      row(cell("총합"), cell("0", { formula: "SUM(ABOVE)", format: "currency" })),
    ),
  );
  it("ABOVE 방향 — 위 formula 셀 skip(데이터만 합)", () => {
    const origin = g.matrix[4][1]!; // 총합행 금액
    expect(evaluateFormula("SUM(ABOVE)", g, origin).value).toBe(300); // 100+200, 소계 제외
  });
  it("ABOVE 방향 — formula 셀 위의 데이터까지 모두 합산", () => {
    // 소계행 위치에서 ABOVE → 위로 100+200(소계 자신은 origin). formula 없으니 정상 300.
    const origin = g.matrix[3][1]!;
    expect(evaluateFormula("SUM(ABOVE)", g, origin).value).toBe(300);
  });
  it("명시적 범위 — formula 셀 포함(사용자 지정 영역은 방향 skip 미적용)", () => {
    // B1 은 formula 셀(text="200", value=200). LEFT 였다면 skip 되어 A1(100)만.
    // 명시적 범위 SUM(A1:B1) 은 B1(formula) 도 포함 → 300.
    const g3 = buildTableGrid(
      table(row(cell("100"), cell("200", { formula: "A1*2", format: "number" }), cell("0", { formula: "SUM(A1:B1)" }))),
    );
    const origin = g3.matrix[0][2]!;
    expect(evaluateFormula("SUM(A1:B1)", g3, origin).value).toBe(300);
  });
  it("LEFT 방향 — 같은 행의 formula 셀 skip", () => {
    const g2 = buildTableGrid(
      table(row(cell("100"), cell("0", { formula: "A1*2" }), cell("200"), cell("0", { formula: "SUM(LEFT)" }))),
    );
    const origin = g2.matrix[0][3]!;
    // LEFT: col2(200) + col1(formula, skip) + col0(100) = 300
    expect(evaluateFormula("SUM(LEFT)", g2, origin).value).toBe(300);
  });
});

describe("evaluateFormula — LEFT 방향", () => {
  it("같은 행의 왼쪽 숫자 합", () => {
    const g = buildTableGrid(
      table(row(cell("100"), cell("200"), cell("300"), cell("0"))),
    );
    const origin = g.matrix[0][3]!;
    expect(evaluateFormula("SUM(LEFT)", g, origin).value).toBe(600);
  });
});

describe("evaluateFormula — 명시적 A1 범위", () => {
  it("SUM(B2:B8) — 행/열 범위", () => {
    const g = buildTableGrid(
      table(
        row(cell("항목"), cell("금액")),
        row(cell("A"), cell("100")),
        row(cell("B"), cell("200")),
        row(cell("C"), cell("300")),
      ),
    );
    // 합계 셀 어디든 상관없이 명시적 범위 사용
    const origin = g.matrix[0][0]!;
    expect(evaluateFormula("SUM(B2:B4)", g, origin).value).toBe(600);
    expect(evaluateFormula("SUM(B1:B4)", g, origin).value).toBe(600); // B1(헤더,숫자아님) 무시
  });
  it("범위 밖/빈 값 안전", () => {
    const g = buildTableGrid(table(row(cell("10"), cell("20"))));
    const origin = g.matrix[0][0]!;
    expect(evaluateFormula("SUM(A1:B1)", g, origin).value).toBe(20); // 자기자신(A1) 제외 → B1=20
  });
});

describe("formatCellValue — 수식/포맷 통합 표시", () => {
  it("수식 셀 → 평가+포맷", () => {
    const g = buildTableGrid(
      table(
        row(cell("항목"), cell("금액")),
        row(cell("A"), cell("10000")),
        row(cell("B"), cell("20000")),
        row(cell("합계"), cell("", { formula: "SUM(ABOVE)", format: "currency" })),
      ),
    );
    const sumCell = g.cells.find((c) => c.formula)!;
    expect(formatCellValue(sumCell, g)).toBe("₩30,000");
  });
  it("포맷 전용 셀(수식 없음) → 숫자 포맷", () => {
    const g = buildTableGrid(table(row(cell("10000", { format: "currencyWon" }))));
    expect(formatCellValue(g.cells[0], g)).toBe("10,000원");
  });
  it("잘못된 수식 → #FORMULA!", () => {
    const g = buildTableGrid(table(row(cell("0", { formula: "XYZ(ABOVE)" }))));
    expect(formatCellValue(g.cells[0], g)).toBe("#FORMULA!");
  });
});

describe("isNumberFormat", () => {
  it("알려진 포맷만 true", () => {
    expect(isNumberFormat("currency")).toBe(true);
    expect(isNumberFormat("number2")).toBe(true);
    expect(isNumberFormat("foo")).toBe(false);
    expect(isNumberFormat(null)).toBe(false);
  });
});

/* ---------------- 사칙연산 표현식 엔진(phase 2) ---------------- */

// 3행 3열 그리드: A1=10 B1=20 C1=30 / A2=40 B2=50 C2=60 / A3..C3=0(수식 셀 위치)
const EG = buildTableGrid(
  table(
    row(cell("10"), cell("20"), cell("30")),
    row(cell("40"), cell("50"), cell("60")),
    row(cell("0"), cell("0"), cell("0")),
  ),
);
// origin 은 참조 범위 밖(A3) — 수식 셀은 자기 자신을 합산하지 않는 규칙 때문.
const origin0 = EG.matrix[2][0]!;

describe("isFunctionFormula", () => {
  it("순수 함수호출만 true", () => {
    expect(isFunctionFormula("SUM(ABOVE)")).toBe(true);
    expect(isFunctionFormula("=SUM(A1:A5)")).toBe(true);
    expect(isFunctionFormula("SUM")).toBe(true);
    expect(isFunctionFormula("A1+B1")).toBe(false);
    expect(isFunctionFormula("A1")).toBe(false);
    expect(isFunctionFormula("(A1+A2)*0.1")).toBe(false);
  });
});

describe("evaluateExpression — 사칙연산/우선순위/괄호/셀참조", () => {
  it("기본 사칙연산", () => {
    expect(evaluateExpression("A1+B1", EG, origin0).value).toBe(30);
    expect(evaluateExpression("A1*B1", EG, origin0).value).toBe(200);
    expect(evaluateExpression("C2-A2", EG, origin0).value).toBe(20);
    expect(evaluateExpression("C2/A2", EG, origin0).value).toBe(1.5);
  });
  it("연산자 우선순위(* / 가 + - 보다 먼저)", () => {
    expect(evaluateExpression("A1+B1*C1", EG, origin0).value).toBe(10 + 20 * 30);
    expect(evaluateExpression("A1*B1+C2", EG, origin0).value).toBe(10 * 20 + 60);
  });
  it("괄호", () => {
    expect(evaluateExpression("(A1+B1)*C1", EG, origin0).value).toBe(30 * 30);
    expect(evaluateExpression("((A1))", EG, origin0).value).toBe(10);
  });
  it("단항 마이너스 / 리터럴 숫자", () => {
    expect(evaluateExpression("-A1", EG, origin0).value).toBe(-10);
    expect(evaluateExpression("100", EG, origin0).value).toBe(100);
    expect(evaluateExpression("B2-A1*1.1", EG, origin0).value).toBeCloseTo(50 - 11);
  });
  it("리딩 = 허용", () => {
    expect(evaluateExpression("=A1+B1", EG, origin0).value).toBe(30);
  });
  it("0 나눗셈 → div0", () => {
    expect(evaluateExpression("A1/0", EG, origin0).error).toBe("div0");
  });
  it("빈 셀/비숫자 셀은 0 취급", () => {
    const g = buildTableGrid(table(row(cell("x"), cell("5"))));
    expect(evaluateExpression("A1+B1", g, g.matrix[0][0]!).value).toBe(5);
  });
  it("잘못된 식 → parse 오류", () => {
    expect(evaluateExpression("A1+", EG, origin0).error).toBe("parse");
    expect(evaluateExpression("A1 B1", EG, origin0).error).toBe("parse");
    expect(evaluateExpression("", EG, origin0).error).toBe("parse");
    expect(evaluateExpression(")A1(", EG, origin0).error).toBe("parse");
  });
});

describe("evaluateExpression — 함수호출 포함", () => {
  it("SUM/AVERAGE 범위를 피연산자로", () => {
    expect(evaluateExpression("SUM(A1:C1)", EG, origin0).value).toBe(60);
    expect(evaluateExpression("SUM(A1:C1)+A2", EG, origin0).value).toBe(100);
    expect(evaluateExpression("AVERAGE(A1:A2)*2", EG, origin0).value).toBe(50);
  });
  it("MAX/MIN/COUNT", () => {
    expect(evaluateExpression("MAX(A1:C2)", EG, origin0).value).toBe(60);
    expect(evaluateExpression("MIN(A1:C2)", EG, origin0).value).toBe(10);
    expect(evaluateExpression("COUNT(A1:C2)", EG, origin0).value).toBe(6);
  });
});

describe("evaluateAny — 함수형/표현식 자동 라우팅", () => {
  it("함수형은 기존 경로", () => {
    expect(evaluateAny("SUM(A1:C1)", EG, origin0).value).toBe(60);
  });
  it("산술식은 표현식 경로", () => {
    expect(evaluateAny("A1+B1", EG, origin0).value).toBe(30);
    expect(evaluateAny("(A1+A2)/2", EG, origin0).value).toBe(25);
  });
});

describe("formatCellValue — 산술 수식 셀", () => {
  it("수식 결과를 포맷", () => {
    const g = buildTableGrid(
      table(row(cell("10"), cell("20"), cell("0", { formula: "A1*B1", format: "currency" }))),
    );
    const fcell = g.cells.find((c) => c.formula)!;
    expect(formatCellValue(fcell, g)).toBe("₩200");
  });
  it("함수+산술 혼합", () => {
    const g = buildTableGrid(
      table(
        row(cell("10"), cell("20"), cell("30")),
        row(cell("0", { formula: "SUM(A1:C1)*1.1", format: "number2" })),
      ),
    );
    const fcell = g.cells.find((c) => c.formula)!;
    expect(formatCellValue(fcell, g)).toBe("66.00"); // (10+20+30)*1.1
  });
});

