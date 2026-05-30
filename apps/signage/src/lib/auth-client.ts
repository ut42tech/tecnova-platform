import { createAuthClient } from 'better-auth/react';

// Worker（API）の URL。本番では NEXT_PUBLIC_API_URL を Vercel 側で設定する。
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// クッキーは Worker 側オリジンに発行される。サイネージは別オリジンから fetch するため
// credentials:'include' でクッキーを同送させる（API の TRUSTED_ORIGINS に 3002 を登録済み）。
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: 'include' },
});
