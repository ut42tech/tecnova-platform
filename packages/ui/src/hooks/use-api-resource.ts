'use client';

import { apiErrorMessage, apiJson } from '@tecnova/ui/lib/api-client';
import { useCallback, useEffect, useState } from 'react';

// 取得状態。idle = まだ取得していない（path=null / enabled=false）。
export type ResourceState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

export interface UseApiResourceResult<T> {
  state: ResourceState<T>;
  reload: () => void;
}

export interface UseApiResourceOptions {
  // false のあいだは取得せず idle のままにする（ロール待ち等の条件付き取得用）。
  enabled?: boolean;
}

// path から JSON を取得し loading|ok|error|idle を返す読み取り専用フック。
// admin の各画面で重複していた取得＋状態機械を 1 箇所に集約する。
// - path が null か enabled=false のとき idle（取得しない）。
// - path が変わると自動で再取得する（クエリ文字列を path に含めて
//   検索・フィルタ・ページング・日付変更を表現する）。
// - reload() で手動再取得（更新ボタン・ミューテーション後の再読込）。
// アンマウントやパラメータ変更時に古いレスポンスで setState しないよう
// cancelled フラグでガードする（participant-detail-sheet の実装を踏襲）。
// ミューテーション（POST/PATCH/DELETE）は扱わない。
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

  const reload = useCallback(() => {
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
    let cancelled = false;
    setState({ kind: 'loading' });
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
