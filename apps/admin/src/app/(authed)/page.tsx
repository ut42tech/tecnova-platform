'use client';

import type { TodaySessionsResponse } from '@tecnova/shared/schemas';
import { useEffect, useState } from 'react';
import { ApiError, apiJson } from '@/lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: TodaySessionsResponse }
  | { kind: 'error'; message: string };

// UTC ISO 文字列を JST の HH:mm 表記に整形する。
const fmtTime = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export default function DashboardPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<TodaySessionsResponse>('/api/sessions/today');
        setState({ kind: 'ok', data });
      } catch (e) {
        const message =
          e instanceof ApiError ? `HTTP ${e.status}` : e instanceof Error ? e.message : String(e);
        setState({ kind: 'error', message });
      }
    })();
  }, []);

  if (state.kind === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-lg">読み込み中...</p>
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

  const { event, sessions, summary } = state.data;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline gap-4">
        <h2 className="text-lg font-semibold">本日のセッション</h2>
        <span className="text-sm text-zinc-600">
          {event ? `イベント日付: ${event.date}` : '本日はまだチェックインがありません'}
        </span>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <SummaryCard label="現在の来場者数" value={summary.currentlyPresent} />
        <SummaryCard label="今日の総チェックイン" value={summary.totalCheckedIn} />
        <SummaryCard label="チェックアウト済" value={summary.checkedOut} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">ニックネーム</th>
              <th className="px-3 py-2 font-medium">学年</th>
              <th className="px-3 py-2 font-medium">チェックイン</th>
              <th className="px-3 py-2 font-medium">チェックアウト</th>
              <th className="px-3 py-2 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-zinc-500" colSpan={6}>
                  該当データがありません
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.sessionId} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-mono">{s.participantId}</td>
                  <td className="px-3 py-2">{s.nickname}</td>
                  <td className="px-3 py-2">{s.grade}</td>
                  <td className="px-3 py-2">{fmtTime(s.checkedInAt)}</td>
                  <td className="px-3 py-2">{s.checkedOutAt ? fmtTime(s.checkedOutAt) : '—'}</td>
                  <td className="px-3 py-2">
                    {s.isPresent ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        来場中
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        退出済
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="text-sm text-zinc-600">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}
