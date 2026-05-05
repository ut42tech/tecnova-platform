'use client';

import {
  type CreatePreRegistrationRequest,
  GRADES,
  type Grade,
  type PreRegistrationItem,
  type PreRegistrationsListResponse,
} from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tecnova/ui/components/alert-dialog';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
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
        <h2 className="text-lg font-semibold">事前登録管理</h2>
      </section>

      <CreatePreRegistrationForm onCreated={load} />

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
                <TableHead>事前登録ID</TableHead>
                <TableHead>ニックネーム</TableHead>
                <TableHead>学年</TableHead>
                <TableHead>事前登録日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.preRegistrations.length === 0 ? (
                <TableRow>
                  <TableCell className="py-6 text-center text-muted-foreground" colSpan={5}>
                    未アクティベートの事前登録はありません
                  </TableCell>
                </TableRow>
              ) : (
                state.preRegistrations.map((p) => (
                  <PreRegistrationRow key={p.preRegistrationId} item={p} onDeleted={load} />
                ))
              )}
            </TableBody>
          </Table>
        </Card>
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
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>事前登録の追加</CardTitle>
          <CardDescription>事前登録IDは自動採番されます（PRE-YYYY-NNNN）。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_8rem_12rem_auto] md:items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pre-registration-nickname">ニックネーム</Label>
              <Input
                id="pre-registration-nickname"
                type="text"
                required
                maxLength={40}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>学年</Label>
              <Select value={grade} onValueChange={(value) => setGrade(value as Grade)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pre-registration-date">事前登録日</Label>
              <Input
                id="pre-registration-date"
                type="date"
                required
                value={registeredAt}
                onChange={(e) => setRegisteredAt(e.target.value)}
              />
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

function PreRegistrationRow({
  item,
  onDeleted,
}: {
  item: PreRegistrationItem;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteDescription = `${item.preRegistrationId}（${item.nickname}）を削除します。この操作は取り消せません。`;

  const remove = async () => {
    if (busy) return;
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
    <TableRow className="align-top">
      <TableCell className="font-mono">{item.preRegistrationId}</TableCell>
      <TableCell>{item.nickname}</TableCell>
      <TableCell>{item.grade}</TableCell>
      <TableCell>{item.registeredAt}</TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="xs" disabled={busy}>
                {busy ? '削除中...' : '削除'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>事前登録を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove} disabled={busy}>
                  削除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {error && (
            <Alert variant="destructive" className="max-w-xs">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
