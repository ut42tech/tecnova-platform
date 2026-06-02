'use client';

import { apiErrorMessage, apiJson } from '@tecnova/ui/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

// 取得状態。idle = まだ取得していない（path=null / enabled=false）。
export type ResourceState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

export interface ReloadOptions {
  // true のとき、既にデータがある場合は loading に戻さず裏で再取得する
  // （stale-while-revalidate）。更新ボタンのちらつき回避用。初回取得・path 変更は
  // 従来どおり loading を表示する。
  background?: boolean;
}

export interface UseApiResourceResult<T> {
  state: ResourceState<T>;
  reload: (opts?: ReloadOptions) => void;
}

export interface UseApiResourceOptions {
  // false のあいだは取得せず idle のままにする（ロール待ち等の条件付き取得用）。
  enabled?: boolean;
}

// path から JSON を取得し loading|ok|error|idle を返す読み取り専用フック。
// - path が null か enabled=false のとき idle（取得しない）。
// - path が変わると自動で再取得する（クエリ文字列を path に含めて表現する）。
// - reload() で手動再取得。reload({ background: true }) は表示中のデータを
//   保持したまま裏で再取得する（ちらつき回避）。
// アンマウントやパラメータ変更時に古いレスポンスで setState しないよう
// cancelled フラグでガードする。ミューテーションは扱わない。
export const useApiResource = <T>(
  path: string | null,
  options?: UseApiResourceOptions,
): UseApiResourceResult<T> => {
  const enabled = options?.enabled ?? true;
  // 取得予定なら最初から loading で初期化し、idle の一瞬のちらつきを避ける。
  const [state, setState] = useState<ResourceState<T>>(() =>
    path && enabled ? { kind: 'loading' } : { kind: 'idle' },
  );
  const [reloadKey, setReloadKey] = useState(0);
  // 直近の reload がバックグラウンド要求だったかを次の effect 実行に伝える。
  const backgroundReloadRef = useRef(false);
  // effect の依存に state を入れずに最新値を参照するための ref。
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback((opts?: ReloadOptions) => {
    backgroundReloadRef.current = opts?.background ?? false;
    setReloadKey((k) => k + 1);
  }, []);

  // reloadKey は本文では参照しないが、reload() による手動再取得のトリガーとして
  // 依存配列に必要（path/enabled が同じでも再フェッチさせる）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional refetch trigger
  useEffect(() => {
    if (!path || !enabled) {
      setState({ kind: 'idle' });
      return;
    }
    const background = backgroundReloadRef.current;
    backgroundReloadRef.current = false;
    let cancelled = false;
    // バックグラウンド再取得かつ既にデータ表示中なら loading に戻さず、
    // 現在のデータを表示したまま裏で更新する。それ以外（初回・path 変更・
    // エラーからの再取得）は従来どおり loading を表示する。
    if (!(background && stateRef.current.kind === 'ok')) {
      setState({ kind: 'loading' });
    }
    void (async () => {
      try {
        const data = await apiJson<T>(path);
        if (!cancelled) setState({ kind: 'ok', data });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: apiErrorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, enabled, reloadKey]);

  return { state, reload };
};
