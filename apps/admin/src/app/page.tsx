'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

interface MeResponse {
  user: { id: string; email: string; name: string };
  mentor: { id: string; email: string; name: string; role: 'admin' | 'mentor' };
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: MeResponse }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string };

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${API_URL}/api/me`, { credentials: 'include' });
        if (r.status === 401) {
          router.replace('/login');
          return;
        }
        if (r.status === 403) {
          const body = (await r.json().catch(() => ({}))) as { message?: string };
          setState({
            kind: 'forbidden',
            message: body.message ?? 'アクセス権限がありません',
          });
          return;
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data = (await r.json()) as MeResponse;
        setState({ kind: 'ok', data });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, [router]);

  const signOut = async () => {
    await authClient.signOut();
    router.replace('/login');
  };

  if (state.kind === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-lg">読み込み中...</p>
      </main>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg text-red-600">{state.message}</p>
        <button type="button" onClick={signOut} className="rounded-lg bg-zinc-200 px-4 py-2">
          ログアウト
        </button>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg text-red-600">エラー: {state.message}</p>
      </main>
    );
  }

  const { user, mentor } = state.data;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">テクノバ管理画面</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-600">
            {user.name} ({mentor.role})
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          >
            ログアウト
          </button>
        </div>
      </header>
      <section className="rounded-lg border border-zinc-200 p-6">
        <p className="text-zinc-600">
          ダッシュボード本体は次のフェーズで実装します。今はログインの疎通確認のみです。
        </p>
      </section>
    </main>
  );
}
