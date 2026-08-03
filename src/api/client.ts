import { HttpClient, type AuthTokens } from "../lib/http-client";
import { useAuthStore } from "../store/auth";

// 데이터 API Worker (docx-editor-api) — /api/reports, /api/templates.
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
// 공용 인증 Worker (suseona-auth) — /auth/refresh, /auth/logout, /auth/me, /auth/google(exchange).
export const AUTH_API_URL = (
  import.meta.env.VITE_AUTH_API_URL ?? "https://suseona-api.suseona.com"
).replace(/\/+$/, "");

let refreshing: Promise<boolean> | null = null;

/** 액세스 토큰 만료 시 공용 suseona-auth 에서 1회 조용히 갱신(동시 호출은 하나의 시도 공유). */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return false;
    try {
      const tokens = await new HttpClient({ baseUrl: AUTH_API_URL }).post<AuthTokens>("/auth/refresh", {
        body: { refreshToken },
      });
      useAuthStore.getState().setTokens(tokens);
      return true;
    } catch {
      useAuthStore.getState().logout();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const getToken = () => useAuthStore.getState().accessToken ?? null;

/** 데이터 API 클라이언트(docx-editor-api). */
export const authHttp = new HttpClient({
  baseUrl: API_URL,
  getToken,
  onUnauthorized: refreshAccessToken,
});

/** 인증 Worker 클라이언트(suseona-auth). /auth/logout, /auth/me. */
export const authWorkerHttp = new HttpClient({
  baseUrl: AUTH_API_URL,
  getToken,
  onUnauthorized: refreshAccessToken,
});

/** Blob/binary 다운로드(DOCX export) — 데이터 API. Bearer + 401→refresh→retry. */
export async function authFetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(API_URL.replace(/\/$/, "") + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${getToken() ?? ""}`,
      },
    });
  let res = await doFetch();
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) res = await doFetch();
  }
  return res;
}
