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
}

/** Thin fetch wrapper: auth header, JSON serialization, error normalization, 401→refresh→retry. */
export class HttpClient {
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

  /** One fetch + JSON parse, no retry logic. */
  private async send<T>(path: string, init: RequestOptions): Promise<{ res: Response; parsed: unknown }> {
    const { query, headers, body, ...rest } = init;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const token = this.opts.getToken?.();
    const res = await (this.opts.fetch ?? fetch)(this.buildUrl(path, query), {
      ...rest,
      headers: {
        ...(isForm ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: this.serialize(body),
    });
    const text = res.status === 204 ? '' : await res.text();
    const parsed = text ? JSON.parse(text) : null;
    return { res, parsed };
  }

  private async requestWithRetry<T>(path: string, init: RequestOptions, retried: boolean): Promise<T> {
    let { res, parsed } = await this.send<T>(path, init);
    // Access token may have expired — try one silent refresh, then replay.
    if (res.status === 401 && !retried && this.opts.onUnauthorized) {
      const refreshed = await this.opts.onUnauthorized();
      if (refreshed) ({ res, parsed } = await this.send<T>(path, init));
    }
    if (res.status === 204) return undefined as unknown as T;
    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
      throw new HttpError(
        res.status,
        err?.code ?? `http_${res.status}`,
        err?.message ?? res.statusText,
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
