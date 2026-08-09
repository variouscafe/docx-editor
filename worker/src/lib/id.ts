/** Opaque unique id (UUID v4). */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO timestamp. */
export function isoNow(): string {
  return new Date().toISOString();
}

/**
 * 퍼블릭 공유 링크용 추측 불가 capability 토큰(20바이트=160bit hex).
 * 링크 자체가 접근 권한이므로 newId(UUID) 보다 높은 엔트로피 사용.
 */
export function newShareToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
