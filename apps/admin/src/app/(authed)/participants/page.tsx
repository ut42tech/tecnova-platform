'use client';

import type { ParticipantsListResponse } from '@tecnova/shared/schemas';
import { useEffect, useState } from 'react';
import { ApiError, apiJson } from '@/lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: ParticipantsListResponse }
  | { kind: 'error'; message: string };

const PAGE_SIZE = 50;

const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

export default function ParticipantsPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // 入力のたびに API を叩かないよう 300ms デバウンス。
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    void (async () => {
      setState({ kind: 'loading' });
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        const data = await apiJson<ParticipantsListResponse>(
          `/api/participants?${params.toString()}`,
        );
        setState({ kind: 'ok', data });
      } catch (e) {
        const message =
          e instanceof ApiError ? `HTTP ${e.status}` : e instanceof Error ? e.message : String(e);
        setState({ kind: 'error', message });
      }
    })();
  }, [debouncedSearch, page]);

  const totalPages =
    state.kind === 'ok' ? Math.max(1, Math.ceil(state.data.pagination.total / PAGE_SIZE)) : 1;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">参加者一覧</h2>
        <input
          type="search"
          placeholder="ニックネームで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
        />
      </section>

      {state.kind === 'loading' && <p className="text-zinc-600">読み込み中...</p>}

      {state.kind === 'error' && <p className="text-red-600">エラー: {state.message}</p>}

      {state.kind === 'ok' && (
        <>
          <section className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">ニックネーム</th>
                  <th className="px-3 py-2 font-medium">学年</th>
                  <th className="px-3 py-2 font-medium">アクティベート日</th>
                  <th className="px-3 py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {state.data.participants.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-zinc-500" colSpan={5}>
                      該当データがありません
                    </td>
                  </tr>
                ) : (
                  state.data.participants.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-mono">{p.id}</td>
                      <td className="px-3 py-2">{p.nickname}</td>
                      <td className="px-3 py-2">{p.grade}</td>
                      <td className="px-3 py-2">{fmtDate(p.activatedAt)}</td>
                      <td className="px-3 py-2">
                        {p.active ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                            有効
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                            無効
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="flex items-center justify-between text-sm text-zinc-600">
            <span>
              全 {state.data.pagination.total} 件中 {state.data.participants.length} 件表示
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-zinc-300 px-3 py-1 disabled:text-zinc-300"
              >
                前へ
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-zinc-300 px-3 py-1 disabled:text-zinc-300"
              >
                次へ
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
