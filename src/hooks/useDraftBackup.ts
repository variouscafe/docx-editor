import { useEffect, useState } from "react";

interface DraftBackup<T> {
  /** 마운트 시점에 남아있던 이전 세션의 미저장 임시 스냅샷(복구 후보). 없으면 null. */
  draft: { value: T; ts: number } | null;
  /** 임시 스냅샷 삭제(복구 포기 / 적용 후 호출). */
  clear: () => void;
}

/**
 * localStorage 임시 스냅샷 — 크래시·탭 닫기·오프라인으로 자동저장이 실패한 경우의
 * 마지막 보험. 매 저장 성공마다 제거되므로, 다음 열람 시 남아있다면 "직전 세션이
 * 저장 없이 끝났다"는 뜻 → 호출부가 복구 UI 로 사용자에게 묻는다.
 *
 * @param key    보고서별 격리 키(예: `docx-draft:${id ?? "new"}`)
 * @param value  스냅샷에 담을 현재 작성 내용
 * @param dirty  저장 대기 중인 변경이 있는지(유일한 스냅샷 작성 조건)
 * @param savedAt 마지막 저장 성공 시각. 바뀔 때마다 스냅샷 제거.
 */
export function useDraftBackup<T>(
  key: string,
  value: T,
  dirty: boolean,
  savedAt: number | null,
): DraftBackup<T> {
  const [draft, setDraft] = useState<{ value: T; ts: number } | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { value: T; ts: number }) : null;
    } catch {
      return null;
    }
  });

  // dirty 동안 debounce(800ms) 저장 — 입력 도중엔 매번 갱신하지 않는다.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() }));
      } catch {
        /* quota 초과 / 시크릿모드 — 최후의 보험이므로 실패해도 치명 아님 */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [key, value, dirty]);

  // 저장 성공(savedAt 변경) 시 임시 스냅샷 제거 + 복구 후보 클리어.
  useEffect(() => {
    if (savedAt == null) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setDraft(null);
  }, [savedAt, key]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setDraft(null);
  };

  return { draft, clear };
}
