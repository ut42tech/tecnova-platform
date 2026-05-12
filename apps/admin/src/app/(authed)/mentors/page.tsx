'use client';

import type {
  CreateMentorRequest,
  MentorItem,
  MentorsListResponse,
  UpdateMentorRequest,
} from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { Checkbox } from '@tecnova/ui/components/checkbox';
import { Input } from '@tecnova/ui/components/input';
import { Label } from '@tecnova/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tecnova/ui/components/select';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tecnova/ui/components/table';
import { ApiError, apiJson } from '@tecnova/ui/lib/api-client';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
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
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>アクセス権限がありません</AlertTitle>
          <AlertDescription>この画面は admin ロールのみアクセスできます</AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">メンター管理</h2>
      </section>

      <CreateMentorForm onCreated={load} />

      {state.kind === 'loading' && <Skeleton className="h-6 w-32" />}
      {state.kind === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === 'ok' && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>メールアドレス</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead>最終ログイン</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.mentors.length === 0 ? (
                <TableRow>
                  <TableCell className="py-6 text-center text-muted-foreground" colSpan={7}>
                    該当データがありません
                  </TableCell>
                </TableRow>
              ) : (
                state.mentors.map((m) => <MentorRow key={m.id} mentor={m} onUpdated={load} />)
              )}
            </TableBody>
          </Table>
        </Card>
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
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>メンター追加</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(16rem,1fr)_minmax(12rem,1fr)_10rem_auto] md:items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mentor-email">メールアドレス</Label>
              <Input
                id="mentor-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mentor-name">名前</Label>
              <Input
                id="mentor-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>ロール</Label>
              <Select value={role} onValueChange={(value) => setRole(value as 'admin' | 'mentor')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mentor">mentor</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? '送信中...' : '追加'}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>追加できませんでした</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

function MentorRow({ mentor, onUpdated }: { mentor: MentorItem; onUpdated: () => Promise<void> }) {
  const me = useMe();
  const [role, setRole] = useState(mentor.role);
  const [active, setActive] = useState(mentor.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = role !== mentor.role || active !== mentor.active;
  // 自分自身のロール降格 / 無効化は禁止（最後の admin が自分を外して詰むのを避ける）
  const isSelf = mentor.id === me.mentor.id;
  const activeId = `mentor-active-${mentor.id}`;

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
    <TableRow className="align-top">
      <TableCell>{mentor.email}</TableCell>
      <TableCell>{mentor.name}</TableCell>
      <TableCell>
        <Select
          value={role}
          onValueChange={(value) => setRole(value as 'admin' | 'mentor')}
          disabled={isSelf || busy}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mentor">mentor</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Label htmlFor={activeId} className="inline-flex">
          <Checkbox
            id={activeId}
            checked={active}
            onCheckedChange={(checked) => setActive(checked === true)}
            disabled={isSelf || busy}
          />
          有効
        </Label>
      </TableCell>
      <TableCell>{fmtDate(mentor.createdAt)}</TableCell>
      <TableCell>{fmtDate(mentor.lastLoginAt)}</TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-2">
          <Button type="button" size="xs" onClick={save} disabled={!dirty || busy || isSelf}>
            {busy ? '保存中...' : '保存'}
          </Button>
          {error && (
            <Alert variant="destructive" className="max-w-xs">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {isSelf && <p className="text-xs text-muted-foreground">自分自身は変更不可</p>}
        </div>
      </TableCell>
    </TableRow>
  );
}
