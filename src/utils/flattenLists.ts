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
  return { ...doc, content: flatBlocks(doc.content) };
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
