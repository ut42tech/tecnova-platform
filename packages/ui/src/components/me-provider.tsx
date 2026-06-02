'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api-client';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Skeleton } from './skeleton';

export interface Me {
  user: { id: string; email: string; name: string };
  mentor: { id: string; email: string; name: string; role: 'admin' | 'mentor' };
}

export type MeState =
  | { status: 'loading' }
  | { status: 'ok'; me: Me }
  | { status: 'forbidden'; message: string }
  | { status: 'error'; message: string };

const MeStateContext = createContext<MeState | null>(null);

// 認証状態（loading/ok/forbidden/error）を返す。me が無い間も扱えるので
// シェル（サイドバー等）の即時描画に使う。
export const useMeState = (): MeState => {
  const state = useContext(MeStateContext);
  if (!state) {
    throw new Error('useMeState must be used inside MeProvider');
  }
  return state;
};

// 認証済みの Me を返す。status が ok 以外では throw するため、MeGate の内側
// （＝認証済みが保証される領域）でのみ使う。シグネチャは従来どおり。
export const useMe = (): Me => {
  const state = useMeState();
  if (state.status !== 'ok') {
    throw new Error('useMe must be used inside <MeGate> (me is not loaded)');
  }
  return state.me;
};

export interface MeProviderProps {
  children: React.ReactNode;
  // 401 を受けたときの遷移先。next/router を packages/ui に持ち込まない
  // ため、window.location.replace で素朴に遷移する。
  loginPath?: string;
}

// /api/me を取得して状態を context に流すだけのプロバイダ。**ゲートはしない**
// （常に children を描画する）。ゲートやフォールバックは MeGate が担う。
// これにより、認証解決前でもシェルのクロームを即描画できる。
export function MeProvider({ children, loginPath = '/login' }: MeProviderProps) {
  const [state, setState] = useState<MeState>({ status: 'loading' });

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
          setState({ status: 'forbidden', message: body.message ?? '' });
          return;
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data = (await r.json()) as Me;
        setState({ status: 'ok', me: data });
      } catch (e) {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [loginPath]);

  return <MeStateContext.Provider value={state}>{children}</MeStateContext.Provider>;
}

export interface MeGateProps {
  children: React.ReactNode;
  // 403 時のフォールバック文言。アプリごとに差し替える。
  forbiddenMessage?: string;
  // ステータス別ラッパー <main> の className。背景色などをアプリ側で指定する。
  loadingClassName?: string;
  forbiddenClassName?: string;
  errorClassName?: string;
  // 指定するとローディング表示を差し替える（アプリ固有のスケルトン等）。
  loadingFallback?: React.ReactNode;
}

const DEFAULT_LOADING_CLASS = 'flex flex-1 items-center justify-center p-8';
const DEFAULT_FAILURE_CLASS =
  'flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center';

// 認証状態でゲートする。status==='ok' のときだけ children を描画し、
// それ以外は loading/forbidden/error のフォールバックを出す。
// （従来 MeProvider が一手に担っていたゲート部分をここへ分離した。）
export function MeGate({
  children,
  forbiddenMessage = 'アクセス権限がありません',
  loadingClassName = DEFAULT_LOADING_CLASS,
  forbiddenClassName = DEFAULT_FAILURE_CLASS,
  errorClassName = DEFAULT_FAILURE_CLASS,
  loadingFallback,
}: MeGateProps) {
  const state = useMeState();

  if (state.status === 'loading') {
    if (loadingFallback !== undefined) {
      return <>{loadingFallback}</>;
    }
    return (
      <main className={loadingClassName}>
        <Skeleton className="h-6 w-32" />
      </main>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <main className={forbiddenClassName}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>アクセス権限がありません</AlertTitle>
          <AlertDescription>{state.message || forbiddenMessage}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className={errorClassName}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  return <>{children}</>;
}
