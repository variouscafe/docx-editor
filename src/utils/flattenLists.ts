import type { JSONContent } from "@shared/runs";

/**
 * TipTap JSON 에서 list 노드(bulletList/orderedList/listItem)를 paragraph 로 평탄화.
 *
 * 배경: 에디터가 StarterKit 의 list 노드를 비활성화한 상태. 과거에 리스트로 저장된
 * 기존 문서를 열면 스키마에 해당 노드가 없어 setContent 가 에러를 내고 에디터가
 * 동작하지 않는다. 사내 양식은 헤딩 시작기호가 번호/불릿 역할을 하므로 리스트 노드가
 * 불필요 → 로드 시 listItem 안의 문단들을 일반 paragraph 로 풀어준다.
 * (listItem 내부가 비어 있으면 빈 paragraph 한 개로 보존.)
 */
export function flattenLists(doc: JSONContent | null | undefined): JSONContent | null {
  if (!doc) return doc ?? null;
  // 리스트 노드가 없으면 평탄화 불필요 — 새 객체/배열 생성 없이 원본을 그대로 반환.
  // 사내 양식은 헤딩 시작기호가 리스트 역할을 하므로 대부분의 문서가 이 경로(매 키입력마다
  // safeJson 를 재계산하는 usePreviewEditor 에서 의미 있는 절약).
  if (!hasListNodes(doc.content)) return doc;
  return { ...doc, content: flatBlocks(doc.content) };
}

/** 최상위 블록 중 bulletList/orderedList 가 있는지. flatBlocks 도 최상위만 처리하므로 범위 일치. */
function hasListNodes(nodes: JSONContent[] | undefined): boolean {
  for (const n of nodes ?? []) {
    if (n.type === "bulletList" || n.type === "orderedList") return true;
  }
  return false;
}

function flatBlocks(nodes: JSONContent[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "bulletList" || node.type === "orderedList") {
      // listItem 들을 순회하며 그 안의 블록을 paragraph 로 풀어 평탄화
      for (const item of node.content ?? []) {
        if (item.type !== "listItem" || !item.content?.length) {
          out.push({ type: "paragraph", content: [] });
          continue;
        }
        for (const child of item.content) {
          if (child.type === "paragraph") {
            out.push(child);
          } else {
            out.push({ type: "paragraph", content: child.content ?? [] });
          }
        }
      }
    } else {
      out.push(node);
    }
  }
  return out;
}
