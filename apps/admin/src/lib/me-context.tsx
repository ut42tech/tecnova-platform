'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface Me {
  user: { id: string; email: string; name: string };
  mentor: { id: string; email: string; name: string; role: 'admin' | 'mentor' };
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Me }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string };

const MeContext = createContext<Me | null>(null);

export const useMe = (): Me => {
  const me = useContext(MeContext);
  if (!me) {
    throw new Error('useMe must be used inside MeProvider');
  }
  return me;
};

interface Props {
  children: React.ReactNode;
}

export function MeProvider({ children }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/me');
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
        const data = (await r.json()) as Me;
        setState({ kind: 'ok', data });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, [router]);

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

  return <MeContext.Provider value={state.data}>{children}</MeContext.Provider>;
}
