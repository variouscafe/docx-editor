import { useEffect } from "react";

interface PageMeta {
  title?: string;
  description?: string;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * 페이지별 document.title / description(및 OG·Twitter 메타) 갱신 훅.
 * 언어 전환 시에도 갱신되도록 번역된 문자열 자체를 effect 의존성으로 사용.
 * 언마운트 시 이전 title 로 복원(다음 페이지의 usePageMeta 가 곧 덮어씀).
 * SPA 특성상 크롤러에 보이는 정적 메타는 index.html 이 출처 —
 * 이 훅은 탭 제목·공유 디버거 등 런타임 경험용.
 */
export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) {
      document.title = title;
      setMeta("property", "og:title", title);
      setMeta("name", "twitter:title", title);
    }
    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
      setMeta("name", "twitter:description", description);
    }
    return () => {
      document.title = prevTitle;
    };
  }, [title, description]);
}
