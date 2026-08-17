// HttpClient — API Worker 호출용: Bearer JWT + JSON 직렬화 + 에러 정규화 + 401→refresh→retry.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface HttpClientOptions {
  /** Base URL of the API (no trailing slash), e.g. 'http://localhost:8787'. */
  baseUrl: string;
  /** Returns the current bearer token (user JWT). */
  getToken?: () => string | null | undefined;
  /** Invoked once when a request receives a 401; resolve true to retry the
   *  request (e.g. after silently refreshing an expired access token). */
  onUnauthorized?: () => Promise<boolean>;
  /** Injectable fetch (defaults to global fetch). */
  fetch?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  query?: Query;
  headers?: Record<string, string>;
  body?: unknown;
  /** 요청 타임아웃(ms). 기본 30초 — 정체(블랙홀) 연결이 무한 대기하며 이후 저장·업로드를
   *  블록하는 것을 방지. 0 지정 시 무제한. */
  timeoutMs?: number;
}

/** Thin fetch wrapper: auth header, JSON serialization, error normalization, 401→refresh→retry. */
export class HttpClient {
  /** 기본 요청 타임아웃 — RequestInit.timeoutMs 로 재정의 가능. */
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  constructor(private opts: HttpClientOptions) {}

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(this.opts.baseUrl.replace(/\/$/, '') + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private serialize(body: unknown): BodyInit | undefined {
    if (body === undefined || body === null) return undefined;
    if (typeof FormData !== 'undefined' && body instanceof FormData) return body;
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    return this.requestWithRetry<T>(path, init, false);
  }

  /** One fetch + JSON parse, no retry logic.
   *  본문이 JSON 이 아니면(예: Cloudflare HTML 502/413 페이지) parse 를 실패로
   *  삼키지 않고 원문 텍스트를 그대로 돌려줘 에러 메시지로 활용할 수 있게 한다. */
  private async send<T>(path: string, init: RequestOptions): Promise<{ res: Response; parsed: unknown; text: string }> {
    const { query, headers, body, timeoutMs, signal, ...rest } = init;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const token = this.opts.getToken?.();
    const ms = timeoutMs ?? HttpClient.DEFAULT_TIMEOUT_MS;
    const res = await (this.opts.fetch ?? fetch)(this.buildUrl(path, query), {
      ...rest,
      // 정체 연결 차단 — 호출자 signal 이 있으면 우선, 0 이면 무제한.
      signal: signal ?? (ms > 0 ? AbortSignal.timeout(ms) : undefined),
      headers: {
        ...(isForm ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: this.serialize(body),
    });
    const text = res.status === 204 ? '' : await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null; // HTML 에러 페이지 등 — text 스니펫으로 폴백
      }
    }
    return { res, parsed, text };
  }

  private async requestWithRetry<T>(path: string, init: RequestOptions, retried: boolean): Promise<T> {
    let { res, parsed, text } = await this.send<T>(path, init);
    // Access token may have expired — try one silent refresh, then replay.
    if (res.status === 401 && !retried && this.opts.onUnauthorized) {
      const refreshed = await this.opts.onUnauthorized();
      if (refreshed) ({ res, parsed, text } = await this.send<T>(path, init));
    }
    if (res.status === 204) return undefined as unknown as T;
    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
      throw new HttpError(
        res.status,
        err?.code ?? `http_${res.status}`,
        err?.message ?? (text ? text.slice(0, 200) : res.statusText),
        parsed,
      );
    }
    return parsed as T;
  }

  get = <T>(path: string, init: RequestOptions = {}) => this.request<T>(path, { ...init, method: 'GET' });
  post = <T>(path: string, init: RequestOptions = {}) => this.request<T>(path, { ...init, method: 'POST' });
  put = <T>(path: string, init: RequestOptions = {}) => this.request<T>(path, { ...init, method: 'PUT' });
  patch = <T>(path: string, init: RequestOptions = {}) => this.request<T>(path, { ...init, method: 'PATCH' });
  del = <T>(path: string, init: RequestOptions = {}) => this.request<T>(path, { ...init, method: 'DELETE' });
}
