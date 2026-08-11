import { lazy, type ComponentType } from "react";

/**
 * lazy() 를 감싸 동적 import(청크) 로드 실패 시 자동 새로고침.
 *
 * 빈번한 배포에서 발생하는 전형적 문제: 브라우저가 캐시한 이전 앱 셸이 현재 배포에 없는
 * 청크 해시를 lazy-load 하려다 "Failed to fetch dynamically imported module" 로 실패.
 * React.lazy 실패는 가까운 ErrorBoundary 가 잡아 window 핸들러로는 검지되지 않으므로,
 * 로더 자체에서 잡아 페이지를 새로고침(→ 최신 index.html/앱 셸/청크 수신).
 *
 * 무한 루프 방지: sessionStorage 플래그로 세션당 1회만 재시도. 재시도 후에도 실패하면
 * 에러를 그대로 throw 하여 ErrorBoundary 가 처리.
 */
const CHUNK_FAIL_RE = /dynamically imported module|Importing a module script failed|error loading dynamically/i;

export function lazyChunk<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const msg = (err && typeof err === "object" && "message" in err ? String((err as { message?: unknown }).message) : String(err)) ?? "";
      if (CHUNK_FAIL_RE.test(msg) && sessionStorage.getItem("__chunkReload") !== "1") {
        sessionStorage.setItem("__chunkReload", "1");
        window.location.reload();
      }
      throw err;
    }),
  );
}
