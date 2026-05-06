// API クライアント共通ヘルパー。`/checkin/*` も cookie-based セッションなので
// 必ず credentials: 'include' を付ける必要がある（apps/api 側の CORS が
// credentials: true で設定されている前提）。
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error: HTTP ${status}`);
    this.name = 'ApiError';
  }
}

interface ApiInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

const buildInit = (init?: ApiInit): RequestInit => {
  const headers = new Headers(init?.headers);
  let body: BodyInit | undefined;
  if (init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }
  return { ...init, headers, body, credentials: 'include' };
};

export const readErrorMessage = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
};

export const apiJson = async <T>(path: string, init?: ApiInit): Promise<T> => {
  const r = await fetch(`${API_URL}${path}`, buildInit(init));
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body);
  }
  return (await r.json()) as T;
};

// /api/me などレスポンスを使い分けたいときは Response を直接返す版を使う。
export const apiFetch = (path: string, init?: ApiInit): Promise<Response> =>
  fetch(`${API_URL}${path}`, buildInit(init));
