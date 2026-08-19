/**
 * 라인 단위 diff(LCS 기반) — 리비전 변경사항 표시용.
 * 의존성 없는 자체 구현: 공통 prefix/suffix 를 잘라낸 뒤 남은 중간 구간만
 * (n+1)×(m+1) LCS 테이블로 최장 공통 부분수열을 구해 추가/삭제/동일 라인 시퀀스를 만든다.
 * 리비전 비교는 content_md(마크다운 미러) 기준 — 서식 마크까지 포함된 텍스트 차이.
 */

export type DiffOp =
  | { type: "equal"; lines: string[] }
  | { type: "added"; lines: string[] }
  | { type: "removed"; lines: string[] };

/** LCS 안전 상한 — 중간 구간의 한쪽이 이보다 크면 비교 생략(tooLarge 표시). */
const MAX_MID_LINES = 1500;

export interface LineDiffResult {
  ops: DiffOp[];
  /** 비교 구간이 상한을 넘어 생략됨 — 이 경우 ops 는 head 까지만 채워진다. */
  tooLarge: boolean;
}

/**
 * 두 텍스트의 라인 diff. 연속된 같은 종류 변경은 하나의 op로 병합하고
 * removed → added 순서로 배치(일반적인 diff 관례 — 워드의 변경사항 표시와 유사).
 */
export function lineDiff(oldText: string, newText: string): LineDiffResult {
  const a = oldText.split("\n");
  const b = newText.split("\n");

  // 공통 prefix/suffix 제거 — 대부분의 리비전은 문서 일부만 바뀌므로 DP 구간이 크게 줄어든다.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const head = a.slice(0, start);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const tail = a.slice(endA);

  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], lines: string[]) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.lines.push(...lines);
    else ops.push({ type, lines });
  };

  if (head.length) push("equal", head);

  if (midA.length + midB.length > 0) {
    if (midA.length > MAX_MID_LINES || midB.length > MAX_MID_LINES) {
      return { ops, tooLarge: true };
    }
    // LCS 테이블 — 최대 1501² 셀. LCS 길이 ≤ min(n,m) ≤ 1500 이므로 Uint16 로 충분(≈4.5MB).
    const n = midA.length;
    const m = midB.length;
    const lcs: Uint16Array[] = Array.from(
      { length: n + 1 },
      () => new Uint16Array(m + 1),
    );
    for (let i = 1; i <= n; i++) {
      const row = lcs[i];
      const above = lcs[i - 1];
      const ai = midA[i - 1];
      for (let j = 1; j <= m; j++) {
        row[j] =
          ai === midB[j - 1]
            ? above[j - 1] + 1
            : Math.max(above[j], row[j - 1]);
      }
    }
    // 역추적 — 뒤에서 앞으로 op 수집 후 뒤집기(unshift O(n²) 회피).
    const rev: DiffOp[] = [];
    const pushRev = (type: DiffOp["type"], line: string) => {
      const last = rev[rev.length - 1];
      if (last && last.type === type) last.lines.push(line);
      else rev.push({ type, lines: [line] });
    };
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      if (midA[i - 1] === midB[j - 1]) {
        pushRev("equal", midA[i - 1]);
        i--;
        j--;
      } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
        pushRev("removed", midA[i - 1]);
        i--;
      } else {
        pushRev("added", midB[j - 1]);
        j--;
      }
    }
    while (i > 0) pushRev("removed", midA[--i]);
    while (j > 0) pushRev("added", midB[--j]);
    // rev 는 뒤→앞 순서 — op 역순 적용 + 각 op 의 lines 도 역방향이므로 함께 뒤집기.
    for (let k = rev.length - 1; k >= 0; k--) {
      push(rev[k].type, rev[k].lines.slice().reverse());
    }
  }

  if (tail.length) push("equal", tail);
  return { ops: normalizeOps(ops), tooLarge: false };
}

/**
 * 변경 블록 정규화 — 역추적 경로에 따라 added 가 removed 보다 먼저 나올 수 있는데,
 * 워드 변경사항 관례(삭제 후 추가)에 맞춰 equal 사이의 변경 블록을 removed → added 순으로 재배치.
 * 같은 블록 안에서 각각의 상대 순서는 보존된다(재구성 불변식 유지).
 */
function normalizeOps(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "equal") {
      out.push(ops[i]);
      i++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (i < ops.length && ops[i].type !== "equal") {
      const op = ops[i];
      if (op.type === "removed") removed.push(...op.lines);
      else added.push(...op.lines);
      i++;
    }
    if (removed.length) out.push({ type: "removed", lines: removed });
    if (added.length) out.push({ type: "added", lines: added });
  }
  return out;
}

export type CollapsedOp = DiffOp | { type: "skipped"; count: number };

/**
 * diff 표시용 축소 — 동일(unchanged) 구간은 변경 인접 컨텍스트 N줄만 남기고
 * 생략 마커(skipped)로 접는다. 변경(added/removed) 라인은 모두 유지.
 */
export function collapseDiff(ops: DiffOp[], contextLines = 2): CollapsedOp[] {
  const CONTEXT = contextLines;
  const out: CollapsedOp[] = [];
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type !== "equal") {
      out.push(op);
      continue;
    }
    const prevIsChange = idx > 0 && ops[idx - 1].type !== "equal";
    const nextIsChange = idx + 1 < ops.length && ops[idx + 1].type !== "equal";
    if (!prevIsChange && !nextIsChange) {
      // 순수 동일 구간 — 앞뒤 컨텍스트만
      const top = op.lines.slice(0, CONTEXT);
      const bottom = op.lines.slice(-CONTEXT);
      const skipped = op.lines.length - top.length - bottom.length;
      if (skipped > 0) {
        if (top.length) out.push({ type: "equal", lines: top });
        out.push({ type: "skipped", count: skipped });
        if (bottom.length) out.push({ type: "equal", lines: bottom });
      } else {
        out.push(op);
      }
    } else if (prevIsChange && nextIsChange) {
      // 변경 사이에 끼인 동일 구간 — 앞뒤 컨텍스트만
      if (op.lines.length <= 2 * CONTEXT) {
        out.push(op);
      } else {
        out.push({ type: "equal", lines: op.lines.slice(0, CONTEXT) });
        out.push({ type: "skipped", count: op.lines.length - 2 * CONTEXT });
        out.push({ type: "equal", lines: op.lines.slice(-CONTEXT) });
      }
    } else {
      // 한쪽 끝만 변경 인접 — 해당 방향 컨텍스트만. 위치도 방향에 맞게(앞 컨텍스트→앞).
      const keep = prevIsChange
        ? op.lines.slice(-CONTEXT)
        : op.lines.slice(0, CONTEXT);
      const skipped = op.lines.length - keep.length;
      if (prevIsChange) {
        if (skipped > 0) out.push({ type: "skipped", count: skipped });
        if (keep.length) out.push({ type: "equal", lines: keep });
      } else {
        if (keep.length) out.push({ type: "equal", lines: keep });
        if (skipped > 0) out.push({ type: "skipped", count: skipped });
      }
    }
  }
  return out;
}
