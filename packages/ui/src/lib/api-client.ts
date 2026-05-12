// admin / checkin 共通の API クライアントヘルパー。
// `/api/*` と `/checkin/*` は cookie-based セッションを前提にしているので、
// すべての fetch に credentials: 'include' を付与する。
// apps/api 側の CORS が credentials: true で設定されている前提。

// packages/ui は @types/node を持たないため process の型を最小限で宣言する。
// 値は Next.js が build 時に NEXT_PUBLIC_API_URL をリテラルに置換するので、
// ここでは型情報があれば十分。
declare const process: { env: { NEXT_PUBLIC_API_URL?: string } };

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

// 非 OK レスポンスから人間向けメッセージを取り出すヘルパ。
// checkin 側の各画面で `if (!r.ok) throw new Error(await readErrorMessage(r))`
// パターンで使う。
export const readErrorMessage = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
};
