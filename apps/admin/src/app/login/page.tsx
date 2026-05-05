'use client';

import { Button } from '@tecnova/ui/components/button';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // callbackURL は絶対URLで渡す。相対パスだと Better Auth は authClient の
      // baseURL（= API オリジン）に対して解決してしまい、ログイン後に
      // localhost:8787 に着地する。フロントのオリジンに戻したいので
      // window.location.origin で組み立てる。
      // trustedOrigins（apps/api/src/lib/auth.ts）に admin の origin が
      // 入っていることが前提。
      const redirect = `${window.location.origin}/`;
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: redirect,
        errorCallbackURL: redirect,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">テクノバ管理画面</h1>
      <p className="text-zinc-600">許可リストに登録されたメンターのみログインできます</p>
      <Button type="button" size="lg" onClick={signIn} disabled={busy}>
        {busy ? 'リダイレクト中...' : 'Google でログイン'}
      </Button>
      {error && <p className="text-red-600">エラー: {error}</p>}
    </main>
  );
}
