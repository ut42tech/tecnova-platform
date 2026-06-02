'use client';

import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import {
  type ActivatedPreRegistrationItem,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tecnova/ui/components/collapsible';
import { Input } from '@tecnova/ui/components/input';
import { Label } from '@tecnova/ui/components/label';
import { useMe } from '@tecnova/ui/components/me-provider';
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
import { TableSkeleton } from '@tecnova/ui/components/table-skeleton';
import { ApiError, apiFetch, apiJson } from '@tecnova/ui/lib/api-client';
import { toastError, toastSuccess } from '@tecnova/ui/lib/toast';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { RecordCard, RecordField } from '@/components/record-card';

type State =
  | { kind: 'loading' }
  | {
      kind: 'ok';
      preRegistrations: PreRegistrationItem[];
      activatedPreRegistrations: ActivatedPreRegistrationItem[];
    }
  | { kind: 'error'; message: string };

const todayInJst = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export default function PreRegistrationsPage() {
  const me = useMe();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await apiJson<PreRegistrationsListResponse>('/api/pre-registrations');
      setState({
        kind: 'ok',
        preRegistrations: data.preRegistrations,
        activatedPreRegistrations: data.activatedPreRegistrations ?? [],
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
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
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="事前登録管理"
        description="ID未発行の事前登録を追加・削除し、ID発行済みの利用者を参照します"
      />

      <CreatePreRegistrationForm onCreated={load} />

      {state.kind === 'loading' && (
        <>
          <div className="hidden md:block">
            <TableSkeleton columns={6} rows={8} />
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        </>
      )}
      {state.kind === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>読み込めませんでした</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.kind === 'ok' && (
        <>
          {state.preRegistrations.length === 0 ? (
            <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              ID未発行の事前登録はありません
            </div>
          ) : (
            <>
              {/* モバイル: カードリスト */}
              <div className="flex flex-col gap-3 md:hidden">
                {state.preRegistrations.map((p) => (
                  <PreRegistrationRow
                    key={p.preRegistrationId}
                    item={p}
                    onDeleted={load}
                    variant="card"
                  />
                ))}
              </div>

              {/* デスクトップ: テーブル */}
              <Card className="hidden p-0 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>事前登録ID</TableHead>
                      <TableHead>氏名</TableHead>
                      <TableHead>ニックネーム</TableHead>
                      <TableHead>学年</TableHead>
                      <TableHead>事前登録日</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.preRegistrations.map((p) => (
                      <PreRegistrationRow
                        key={p.preRegistrationId}
                        item={p}
                        onDeleted={load}
                        variant="row"
                      />
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}

          <ActivatedPreRegistrationsTable items={state.activatedPreRegistrations} />
        </>
      )}
    </main>
  );
}

function ActivatedPreRegistrationsTable({ items }: { items: ActivatedPreRegistrationItem[] }) {
  const [open, setOpen] = useState(false);
  const label = open ? '閉じる' : '開く';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="gap-0 p-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-medium">ID発行済みの利用者</h2>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-label={label}>
              {open ? <IconChevronDown /> : <IconChevronRight />}
              {label}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {/* モバイル: カードリスト */}
          <div className="flex flex-col gap-3 p-4 md:hidden">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ID発行済みの利用者はありません
              </p>
            ) : (
              items.map((item) => (
                <RecordCard key={item.preRegistrationId}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.nickname}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.fullName}・{item.grade}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <RecordField label="事前登録ID">
                      <span className="font-mono text-xs">{item.preRegistrationId}</span>
                    </RecordField>
                    <RecordField label="本登録ID">
                      <span className="font-mono text-xs">{item.internalId || '-'}</span>
                    </RecordField>
                    <RecordField label="事前登録日">{item.registeredAt}</RecordField>
                    <RecordField label="ID発行日時">{item.activatedAt || '-'}</RecordField>
                  </div>
                </RecordCard>
              ))
            )}
          </div>

          {/* デスクトップ: テーブル */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>事前登録ID</TableHead>
                  <TableHead>本登録ID</TableHead>
                  <TableHead>氏名</TableHead>
                  <TableHead>ニックネーム</TableHead>
                  <TableHead>学年</TableHead>
                  <TableHead>事前登録日</TableHead>
                  <TableHead>ID発行日時</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>
                      ID発行済みの利用者はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.preRegistrationId} className="align-top">
                      <TableCell className="font-mono">{item.preRegistrationId}</TableCell>
                      <TableCell className="font-mono">{item.internalId || '-'}</TableCell>
                      <TableCell>{item.fullName}</TableCell>
                      <TableCell>{item.nickname}</TableCell>
                      <TableCell>{item.grade}</TableCell>
                      <TableCell>{item.registeredAt}</TableCell>
                      <TableCell>{item.activatedAt || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function CreatePreRegistrationForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [grade, setGrade] = useState<Grade | ''>('');
  const [registeredAt, setRegisteredAt] = useState(todayInJst());
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!grade) {
      toastError(new Error('学年を選択してください'), '入力内容を確認してください');
      return;
    }
    setBusy(true);
    try {
      const body: CreatePreRegistrationRequest = {
        fullName,
        nickname,
        grade,
        registeredAt,
      };
      const created = await apiJson<PreRegistrationItem>('/api/pre-registrations', {
        method: 'POST',
        body,
      });
      toastSuccess(`${created.preRegistrationId} を追加しました`);
      setFullName('');
      setNickname('');
      setGrade('');
      setRegisteredAt(todayInJst());
      await onCreated();
    } catch (e) {
      toastError(e, '事前登録を追加できませんでした');
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
          <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_8rem_12rem_auto] md:items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pre-registration-full-name">氏名</Label>
              <Input
                id="pre-registration-full-name"
                type="text"
                required
                maxLength={80}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
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
                  <SelectValue placeholder="選択してください" />
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
        </CardContent>
      </Card>
    </form>
  );
}

function PreRegistrationRow({
  item,
  onDeleted,
  variant,
}: {
  item: PreRegistrationItem;
  onDeleted: () => Promise<void>;
  // 'row' = デスクトップのテーブル行 / 'card' = モバイルのカード
  variant: 'row' | 'card';
}) {
  const [busy, setBusy] = useState(false);
  const deleteDescription = `${item.preRegistrationId}（${item.fullName} / ${item.nickname}）を削除します。この操作は取り消せません。`;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
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
      toastSuccess(`${item.preRegistrationId} を削除しました`);
      await onDeleted();
    } catch (e) {
      toastError(e, '削除できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const deleteButton = (
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
  );

  if (variant === 'card') {
    return (
      <RecordCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{item.nickname}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.fullName}・{item.grade}
            </p>
          </div>
          {deleteButton}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <RecordField label="事前登録ID">
            <span className="font-mono text-xs">{item.preRegistrationId}</span>
          </RecordField>
          <RecordField label="事前登録日">{item.registeredAt}</RecordField>
        </div>
      </RecordCard>
    );
  }

  return (
    <TableRow className="align-top">
      <TableCell className="font-mono">{item.preRegistrationId}</TableCell>
      <TableCell>{item.fullName}</TableCell>
      <TableCell>{item.nickname}</TableCell>
      <TableCell>{item.grade}</TableCell>
      <TableCell>{item.registeredAt}</TableCell>
      <TableCell>{deleteButton}</TableCell>
    </TableRow>
  );
}
