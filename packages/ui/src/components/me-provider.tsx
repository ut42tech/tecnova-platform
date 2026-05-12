'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api-client';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Skeleton } from './skeleton';

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

export interface MeProviderProps {
  children: React.ReactNode;
  // 401 を受けたときの遷移先。next/router を packages/ui に持ち込まない
  // ため、window.location.replace で素朴に遷移する。/login は別ルート
  // グループなので、フル再読み込みでも UX 差はほぼない。
  loginPath?: string;
  // 403 時のフォールバック文言。アプリごとに「管理画面の…」「受付アプリの…」
  // など差し替えたいので props で受け取る。
  forbiddenMessage?: string;
  // ステータス別ラッパー <main> の className。背景色などをアプリ側で指定する。
  loadingClassName?: string;
  forbiddenClassName?: string;
  errorClassName?: string;
}

const DEFAULT_LOADING_CLASS = 'flex flex-1 items-center justify-center p-8';
const DEFAULT_FAILURE_CLASS =
  'flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center';

export function MeProvider({
  children,
  loginPath = '/login',
  forbiddenMessage = 'アクセス権限がありません',
  loadingClassName = DEFAULT_LOADING_CLASS,
  forbiddenClassName = DEFAULT_FAILURE_CLASS,
  errorClassName = DEFAULT_FAILURE_CLASS,
}: MeProviderProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/me');
        if (r.status === 401) {
          window.location.replace(loginPath);
          return;
        }
        if (r.status === 403) {
          const body = (await r.json().catch(() => ({}))) as { message?: string };
          setState({ kind: 'forbidden', message: body.message ?? forbiddenMessage });
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
  }, [loginPath, forbiddenMessage]);

  if (state.kind === 'loading') {
    return (
      <main className={loadingClassName}>
        <Skeleton className="h-6 w-32" />
      </main>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <main className={forbiddenClassName}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>アクセス権限がありません</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className={errorClassName}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  return <MeContext.Provider value={state.data}>{children}</MeContext.Provider>;
}
