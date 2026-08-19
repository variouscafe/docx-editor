import { describe, it, expect } from "vitest";
import { lineDiff, collapseDiff } from "./lineDiff";

/** ops 를 "3= 2- 1+" 같은 요약 문자열로 — 순서·병합 검증용. */
function summarize(ops: { type: string; lines: string[] }[]) {
  return ops.map((o) => `${o.lines.length}${o.type[0]}`).join(" ");
}

describe("lineDiff", () => {
  it("동일 텍스트는 equal 하나", () => {
    const { ops, tooLarge } = lineDiff("a\nb\nc", "a\nb\nc");
    expect(tooLarge).toBe(false);
    expect(summarize(ops)).toBe("3e");
  });

  it("끝에 추가 — equal + added", () => {
    const { ops } = lineDiff("a\nb", "a\nb\nNEW");
    expect(summarize(ops)).toBe("2e 1a");
    expect(ops[1].lines).toEqual(["NEW"]);
  });

  it("끝에서 삭제 — equal + removed", () => {
    const { ops } = lineDiff("a\nb\nOLD", "a\nb");
    expect(summarize(ops)).toBe("2e 1r");
    expect(ops[1].lines).toEqual(["OLD"]);
  });

  it("중간 교체 — removed 가 added 보다 먼저", () => {
    const { ops } = lineDiff("a\nx\nc", "a\ny\nc");
    expect(summarize(ops)).toBe("1e 1r 1a 1e");
    expect(ops[1].lines).toEqual(["x"]);
    expect(ops[2].lines).toEqual(["y"]);
  });

  it("라인 순서 교환도 equal/added/removed 로 표현", () => {
    const { ops } = lineDiff("a\nb\nc", "b\nc\na");
    const added = ops.filter((o) => o.type === "added").flatMap((o) => o.lines);
    const removed = ops.filter((o) => o.type === "removed").flatMap((o) => o.lines);
    // 원본을 재배치한 결과 — 추가/삭제 다중 집합이 같다(순수 이동).
    expect([...removed].sort()).toEqual([...added].sort());
    // join 하면 원본/신본 각각 재구성된다.
    const rebuiltOld = ops
      .flatMap((o) => (o.type === "equal" || o.type === "removed" ? o.lines : []))
      .join("\n");
    const rebuiltNew = ops
      .flatMap((o) => (o.type === "equal" || o.type === "added" ? o.lines : []))
      .join("\n");
    expect(rebuiltOld).toBe("a\nb\nc");
    expect(rebuiltNew).toBe("b\nc\na");
  });

  it("ops 재구성 불변식 — 임의 텍스트에서 old/new 완전 복원", () => {
    const old = "h1\n\n본문 첫 줄.\n++박스++\n==형광==\n끝.";
    const neu = "h1\n\n본문 첫 줄 수정.\n++박스2++\n==형광==\n끝.\n추가";
    const { ops } = lineDiff(old, neu);
    const rebuiltOld = ops
      .flatMap((o) => (o.type === "equal" || o.type === "removed" ? o.lines : []))
      .join("\n");
    const rebuiltNew = ops
      .flatMap((o) => (o.type === "equal" || o.type === "added" ? o.lines : []))
      .join("\n");
    expect(rebuiltOld).toBe(old);
    expect(rebuiltNew).toBe(neu);
  });

  it("빈 텍스트 ↔ 텍스트 — 빈 쪽도 라인 1개로 취급", () => {
    const { ops } = lineDiff("", "a\nb");
    expect(summarize(ops)).toBe("1r 2a"); // "" 가 removed, "a","b" 가 added
    const back = lineDiff("a\nb", "");
    expect(summarize(back.ops)).toBe("2r 1a");
  });

  it("중간 구간이 상한 초과 시 tooLarge", () => {
    const big = Array.from({ length: 1600 }, (_, i) => `line${i}`).join("\n");
    const changed = big + "\nextra";
    // prefix trim 으로 mid 는 1줄 차이만 — tooLarge 아님
    expect(lineDiff(big, changed).tooLarge).toBe(false);
    // 전체가 다른 텍스트 — mid 구간 1600 > 1500 → tooLarge
    const other = Array.from({ length: 1600 }, (_, i) => `diff${i}`).join("\n");
    const r = lineDiff(big, other);
    expect(r.tooLarge).toBe(true);
  });
});

describe("collapseDiff", () => {
  it("변경 인접 컨텍스트만 남기고 skipped 로 접는다", () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `L${i}`);
    const ops = [
      { type: "equal" as const, lines: lines(10) },
      { type: "removed" as const, lines: ["X"] },
      { type: "added" as const, lines: ["Y"] },
      { type: "equal" as const, lines: lines(10) },
    ];
    const out = collapseDiff(ops, 2);
    // 첫/마지막 equal 은 한쪽만 변경 인접 — 해당 방향 컨텍스트 2줄만
    expect(out).toEqual([
      { type: "equal", lines: ["L0", "L1"] },
      { type: "skipped", count: 8 },
      { type: "removed", lines: ["X"] },
      { type: "added", lines: ["Y"] },
      { type: "skipped", count: 8 },
      { type: "equal", lines: ["L8", "L9"] },
    ]);
  });

  it("짧은 동일 구간은 그대로 유지", () => {
    const ops = [
      { type: "equal" as const, lines: ["a"] },
      { type: "added" as const, lines: ["b"] },
      { type: "equal" as const, lines: ["c"] },
    ];
    expect(collapseDiff(ops, 2)).toEqual(ops);
  });
});
