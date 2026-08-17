import { authHttp } from "./client";

/** 업로드 응답 — url 은 상대 경로(/api/images/{id})로 JSON 에 저장(도메인 독립). */
export interface UploadImageResult {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

/** 이미지 업로드 — FormData 는 HttpClient 가 그대로 전송(Bearer + 401→refresh 포함).
 *  느린 회선의 대용량 사진(최대 10MB)을 고려해 타임아웃 120s — 업로드가 정체되면
 *  waitForPendingImageUploads 를 거쳐 저장 전체가 블록되므로 상한이 반드시 필요하다. */
export async function uploadImage(
  blob: Blob,
  width?: number | null,
  height?: number | null
): Promise<UploadImageResult> {
  const fd = new FormData();
  fd.append("file", blob, "image");
  if (width != null) fd.append("width", String(width));
  if (height != null) fd.append("height", String(height));
  return authHttp.post<UploadImageResult>("/api/uploads", { body: fd, timeoutMs: 120_000 });
}

/**
 * 진행 중 이미지 업로드 레지스트리 — 저장(PATCH)이 blob: src 를 영속화하지 않도록
 * saveOnce 가 flush 전에 대기한다. 각 promise 는 업로드 + src 교체 dispatch 까지 커버
 * (해제 시점엔 onContentChange 가 이미 발생해 editorJsonRef 가 최신 상태).
 */
const pending = new Set<Promise<void>>();

export function trackImageUpload(p: Promise<void>): void {
  pending.add(p);
  p.finally(() => {
    pending.delete(p);
  }).catch(() => {
    /* 실패 처리(노드 제거+토스트)는 삽입부가 담당 — 여기선 unhandled rejection 방지만. */
  });
}

export function hasPendingImageUploads(): boolean {
  return pending.size > 0;
}

/** 진행 중 업로드가 전부 끝날 때까지 대기. 대기 중 새 업로드가 시작돼도 누락 없이 루프. */
export async function waitForPendingImageUploads(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
