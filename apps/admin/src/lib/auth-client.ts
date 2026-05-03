import { createAuthClient } from 'better-auth/react';

// Worker（API）の URL。本番では NEXT_PUBLIC_API_URL を Vercel 側で設定する。
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// クッキーは Worker 側のオリジン（localhost:8787 / 本番ドメイン）に発行される。
// 管理画面は別オリジン（localhost:3001 / 本番Vercel）から fetch するので、
// fetchOptions.credentials を 'include' にしてブラウザにクッキーを同送させる。
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    credentials: 'include',
  },
});
