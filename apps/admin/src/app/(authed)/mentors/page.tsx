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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tecnova/ui/components/tooltip';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { formatJstDate } from '@tecnova/ui/lib/format';
import { toastError, toastSuccess } from '@tecnova/ui/lib/toast';
import { cn } from '@tecnova/ui/lib/utils';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { RecordCard, RecordField } from '@/components/record-card';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; mentors: MentorItem[] }
  | { kind: 'error'; message: string };

export default function MentorsPage() {
  const me = useMe();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await apiJson<MentorsListResponse>('/api/mentors');
      setState({ kind: 'ok', mentors: data.mentors });
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
    <TooltipProvider>
      <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
        <PageHeader
          title="管理者一覧"
          description="管理画面を利用するアカウントの追加・ロール変更・無効化を行います"
        />

        <CreateMentorForm onCreated={load} />

        {state.kind === 'loading' && (
          <>
            <div className="hidden md:block">
              <TableSkeleton columns={7} rows={5} />
            </div>
            <div className="flex flex-col gap-3 md:hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-44 w-full" />
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

        {state.kind === 'ok' &&
          (state.mentors.length === 0 ? (
            <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              まだ管理者が登録されていません
            </div>
          ) : (
            <>
              {/* モバイル: カードリスト。
                  card / row 両 variant を常時マウントし CSS で出し分ける（SSR 安全）。
                  各行は編集状態をローカルに持つため、編集途中で md をまたいでリサイズすると
                  未保存の編集が見かけ上消える。admin の利用端末（PC / タブレット）では稀で、
                  保存すれば再取得で両者が同期するため許容するトレードオフ。 */}
              <div className="flex flex-col gap-3 md:hidden">
                {state.mentors.map((m) => (
                  <MentorRow key={m.id} mentor={m} onUpdated={load} variant="card" />
                ))}
              </div>

              {/* デスクトップ: テーブル */}
              <Card className="hidden p-0 md:block">
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
                    {state.mentors.map((m) => (
                      <MentorRow key={m.id} mentor={m} onUpdated={load} variant="row" />
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          ))}
      </main>
    </TooltipProvider>
  );
}

function CreateMentorForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'mentor'>('mentor');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const body: CreateMentorRequest = { email, name, role };
      await apiJson<MentorItem>('/api/mentors', { method: 'POST', body });
      toastSuccess(`${name} を追加しました`);
      setEmail('');
      setName('');
      setRole('mentor');
      await onCreated();
    } catch (e) {
      toastError(e, '管理者を追加できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>管理者追加</CardTitle>
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
        </CardContent>
      </Card>
    </form>
  );
}

function MentorRow({
  mentor,
  onUpdated,
  variant,
}: {
  mentor: MentorItem;
  onUpdated: () => Promise<void>;
  // 'row' = デスクトップのテーブル行 / 'card' = モバイルのカード
  variant: 'row' | 'card';
}) {
  const me = useMe();
  const [role, setRole] = useState(mentor.role);
  const [active, setActive] = useState(mentor.active);
  const [busy, setBusy] = useState(false);

  const dirty = role !== mentor.role || active !== mentor.active;
  // 自分自身のロール降格 / 無効化は禁止（最後の admin が自分を外して詰むのを避ける）
  const isSelf = mentor.id === me.mentor.id;
  const activeId = `mentor-active-${variant}-${mentor.id}`;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const body: UpdateMentorRequest = {};
      if (role !== mentor.role) body.role = role;
      if (active !== mentor.active) body.active = active;
      await apiJson<MentorItem>(`/api/mentors/${mentor.id}`, { method: 'PATCH', body });
      toastSuccess(`${mentor.name} を保存しました`);
      await onUpdated();
    } catch (e) {
      toastError(e, '保存できませんでした');
    } finally {
      setBusy(false);
    }
  };

  // 自分自身の行の操作 UI は、Tooltip で理由を添えてグレーアウトする。
  const wrapSelfReadonly = (node: React.ReactNode) =>
    isSelf ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{node}</span>
        </TooltipTrigger>
        <TooltipContent>自分自身は変更できません</TooltipContent>
      </Tooltip>
    ) : (
      node
    );

  // 操作系 UI（ロール選択・有効チェック・保存）。テーブル行とカードで共有する。
  const roleControl = wrapSelfReadonly(
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
    </Select>,
  );

  const activeControl = wrapSelfReadonly(
    <Label htmlFor={activeId} className="inline-flex">
      <Checkbox
        id={activeId}
        checked={active}
        onCheckedChange={(checked) => setActive(checked === true)}
        disabled={isSelf || busy}
      />
      有効
    </Label>,
  );

  const saveControl = wrapSelfReadonly(
    <Button type="button" size="xs" onClick={save} disabled={!dirty || busy || isSelf}>
      {busy ? '保存中...' : '保存'}
    </Button>,
  );

  if (variant === 'card') {
    return (
      <RecordCard className={cn(!mentor.active && 'opacity-60')}>
        <div className="min-w-0">
          <p className="truncate font-medium">{mentor.name}</p>
          <p className="truncate text-xs text-muted-foreground">{mentor.email}</p>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">ロール</span>
            {roleControl}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">状態</span>
            {activeControl}
          </div>
          <RecordField label="登録日">{formatJstDate(mentor.createdAt)}</RecordField>
          <RecordField label="最終ログイン">{formatJstDate(mentor.lastLoginAt)}</RecordField>
          <div className="flex justify-end pt-1">{saveControl}</div>
        </div>
      </RecordCard>
    );
  }

  return (
    <TableRow className={cn('align-top', !mentor.active && 'opacity-60')}>
      <TableCell>{mentor.email}</TableCell>
      <TableCell>{mentor.name}</TableCell>
      <TableCell>{roleControl}</TableCell>
      <TableCell>{activeControl}</TableCell>
      <TableCell>{formatJstDate(mentor.createdAt)}</TableCell>
      <TableCell>{formatJstDate(mentor.lastLoginAt)}</TableCell>
      <TableCell>{saveControl}</TableCell>
    </TableRow>
  );
}
