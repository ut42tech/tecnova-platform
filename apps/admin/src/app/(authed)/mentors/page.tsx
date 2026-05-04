'use client';

import type {
  CreateMentorRequest,
  MentorItem,
  MentorsListResponse,
  UpdateMentorRequest,
} from '@tecnova/shared/schemas';
import { type FormEvent, useEffect, useState } from 'react';
import { ApiError, apiJson } from '@/lib/api';
import { useMe } from '@/lib/me-context';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; mentors: MentorItem[] }
  | { kind: 'error'; message: string };

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
};

const apiErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    const body = e.body as { message?: string; error?: string } | undefined;
    return body?.message ?? body?.error ?? `HTTP ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
};

export default function MentorsPage() {
  const me = useMe();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await apiJson<MentorsListResponse>('/api/mentors');
      setState({ kind: 'ok', mentors: data.mentors });
    } catch (e) {
      setState({ kind: 'error', message: apiErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    if (me.mentor.role !== 'admin') return;
    void load();
  }, [me.mentor.role, load]);

  // ガード: ナビには非表示だが、URL 直叩き対策。/api/mentors も 403 で弾かれる。
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
        <h2 className="text-lg font-semibold">メンター管理</h2>
      </section>

      <CreateMentorForm onCreated={load} />

      {state.kind === 'loading' && <p className="text-zinc-600">読み込み中...</p>}
      {state.kind === 'error' && <p className="text-red-600">エラー: {state.message}</p>}

      {state.kind === 'ok' && (
        <section className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">メールアドレス</th>
                <th className="px-3 py-2 font-medium">名前</th>
                <th className="px-3 py-2 font-medium">ロール</th>
                <th className="px-3 py-2 font-medium">状態</th>
                <th className="px-3 py-2 font-medium">登録日</th>
                <th className="px-3 py-2 font-medium">最終ログイン</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {state.mentors.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-zinc-500" colSpan={7}>
                    該当データがありません
                  </td>
                </tr>
              ) : (
                state.mentors.map((m) => <MentorRow key={m.id} mentor={m} onUpdated={load} />)
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function CreateMentorForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'mentor'>('mentor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: CreateMentorRequest = { email, name, role };
      await apiJson<MentorItem>('/api/mentors', { method: 'POST', body });
      setEmail('');
      setName('');
      setRole('mentor');
      await onCreated();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <h3 className="text-sm font-semibold">メンター追加</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          メールアドレス
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          名前
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          ロール
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'mentor')}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          >
            <option value="mentor">mentor</option>
            <option value="admin">admin</option>
          </select>
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

function MentorRow({ mentor, onUpdated }: { mentor: MentorItem; onUpdated: () => Promise<void> }) {
  const me = useMe();
  const [role, setRole] = useState(mentor.role);
  const [active, setActive] = useState(mentor.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // onUpdated() でリストが再取得されると React が同じ key でコンポーネントを再利用するため、
  // mentor prop が変わったときにローカルステートを同期しておく。
  useEffect(() => {
    setRole(mentor.role);
  }, [mentor.role]);

  useEffect(() => {
    setActive(mentor.active);
  }, [mentor.active]);

  const dirty = role !== mentor.role || active !== mentor.active;
  // 自分自身のロール降格 / 無効化は禁止（最後の admin が自分を外して詰むのを避ける）
  const isSelf = mentor.id === me.mentor.id;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: UpdateMentorRequest = {};
      if (role !== mentor.role) body.role = role;
      if (active !== mentor.active) body.active = active;
      await apiJson<MentorItem>(`/api/mentors/${mentor.id}`, { method: 'PATCH', body });
      await onUpdated();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-zinc-100 align-top">
      <td className="px-3 py-2">{mentor.email}</td>
      <td className="px-3 py-2">{mentor.name}</td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'mentor')}
          disabled={isSelf || busy}
          className="rounded-lg border border-zinc-300 px-2 py-0.5 text-sm disabled:bg-zinc-100"
        >
          <option value="mentor">mentor</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={isSelf || busy}
          />
          有効
        </label>
      </td>
      <td className="px-3 py-2">{fmtDate(mentor.createdAt)}</td>
      <td className="px-3 py-2">{fmtDate(mentor.lastLoginAt)}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy || isSelf}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white disabled:bg-zinc-300"
        >
          {busy ? '保存中...' : '保存'}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {isSelf && <p className="mt-1 text-xs text-zinc-500">自分自身は変更不可</p>}
      </td>
    </tr>
  );
}
