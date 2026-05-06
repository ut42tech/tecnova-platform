'use client';

import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Skeleton } from '@tecnova/ui/components/skeleton';
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
            message: body.message ?? '受付アプリの利用権限がありません',
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
      <main className="flex flex-1 items-center justify-center bg-sky-50 p-8">
        <Skeleton className="h-6 w-32" />
      </main>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-rose-50 p-8 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>アクセス権限がありません</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-rose-50 p-8 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  return <MeContext.Provider value={state.data}>{children}</MeContext.Provider>;
}
