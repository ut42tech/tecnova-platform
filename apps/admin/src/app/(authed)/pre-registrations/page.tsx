'use client';

import {
  type CreatePreRegistrationRequest,
  GRADES,
  type Grade,
  type PreRegistrationItem,
  type PreRegistrationsListResponse,
} from '@tecnova/shared/schemas';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, apiJson } from '@/lib/api';
import { useMe } from '@/lib/me-context';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; preRegistrations: PreRegistrationItem[] }
  | { kind: 'error'; message: string };

const todayInJst = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const apiErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    const body = e.body as { message?: string; error?: string } | undefined;
    return body?.message ?? body?.error ?? `HTTP ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
};

export default function PreRegistrationsPage() {
  const me = useMe();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await apiJson<PreRegistrationsListResponse>('/api/pre-registrations');
      setState({ kind: 'ok', preRegistrations: data.preRegistrations });
    } catch (e) {
      setState({ kind: 'error', message: apiErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    if (me.mentor.role !== 'admin') return;
    void load();
  }, [me.mentor.role, load]);

  // ガード: ナビには非表示だが、URL 直叩き対策。/api/pre-registrations も 403 で弾かれる。
  if (me.mentor.role !== 'admin') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-lg text-red-600">この画面は admin ロールのみアクセスできます</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">事前登録管理</h2>
      </section>

      <CreatePreRegistrationForm onCreated={load} />

      {state.kind === 'loading' && <p className="text-zinc-600">読み込み中...</p>}
      {state.kind === 'error' && <p className="text-red-600">エラー: {state.message}</p>}

      {state.kind === 'ok' && (
        <section className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">事前登録ID</th>
                <th className="px-3 py-2 font-medium">ニックネーム</th>
                <th className="px-3 py-2 font-medium">学年</th>
                <th className="px-3 py-2 font-medium">事前登録日</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {state.preRegistrations.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-zinc-500" colSpan={5}>
                    未アクティベートの事前登録はありません
                  </td>
                </tr>
              ) : (
                state.preRegistrations.map((p) => (
                  <PreRegistrationRow key={p.preRegistrationId} item={p} onDeleted={load} />
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

const DEFAULT_GRADE: Grade = '小1';

function CreatePreRegistrationForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [nickname, setNickname] = useState('');
  const [grade, setGrade] = useState<Grade>(DEFAULT_GRADE);
  const [registeredAt, setRegisteredAt] = useState(todayInJst());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: CreatePreRegistrationRequest = { nickname, grade, registeredAt };
      await apiJson<PreRegistrationItem>('/api/pre-registrations', { method: 'POST', body });
      setNickname('');
      setGrade(DEFAULT_GRADE);
      setRegisteredAt(todayInJst());
      await onCreated();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <h3 className="text-sm font-semibold">事前登録の追加</h3>
      <p className="text-xs text-zinc-500">事前登録IDは自動採番されます（PRE-YYYY-NNNN）。</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          ニックネーム
          <input
            type="text"
            required
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          学年
          <select
            required
            value={grade}
            onChange={(e) => setGrade(e.target.value as Grade)}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          事前登録日
          <input
            type="date"
            required
            value={registeredAt}
            onChange={(e) => setRegisteredAt(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-1 text-sm font-semibold text-white disabled:bg-zinc-300"
        >
          {busy ? '送信中...' : '追加'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">エラー: {error}</p>}
    </form>
  );
}

function PreRegistrationRow({
  item,
  onDeleted,
}: {
  item: PreRegistrationItem;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy) return;
    if (!confirm(`事前登録 ${item.preRegistrationId}（${item.nickname}）を削除しますか？`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 204 を返すので apiJson ではなく apiFetch を使う。
      const r = await apiFetch(
        `/api/pre-registrations/${encodeURIComponent(item.preRegistrationId)}`,
        {
          method: 'DELETE',
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new ApiError(r.status, body);
      }
      await onDeleted();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-zinc-100 align-top">
      <td className="px-3 py-2 font-mono">{item.preRegistrationId}</td>
      <td className="px-3 py-2">{item.nickname}</td>
      <td className="px-3 py-2">{item.grade}</td>
      <td className="px-3 py-2">{item.registeredAt}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white disabled:bg-zinc-300"
        >
          {busy ? '削除中...' : '削除'}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
