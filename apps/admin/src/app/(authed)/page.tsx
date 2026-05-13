'use client';

import type { TodaySessionsResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
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
import { useEffect, useState } from 'react';

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
        <Skeleton className="h-6 w-32" />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { event, sessions, summary } = state.data;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <section className="flex items-baseline gap-4">
        <h2 className="text-lg font-semibold">本日のセッション</h2>
        <span className="text-sm text-muted-foreground">
          {event ? `イベント日付: ${event.date}` : '本日はまだチェックインがありません'}
        </span>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="現在の来場者数" value={summary.currentlyPresent} />
        <SummaryCard label="今日の総チェックイン" value={summary.totalCheckedIn} />
        <SummaryCard label="チェックアウト済" value={summary.checkedOut} />
      </section>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>氏名</TableHead>
              <TableHead>ニックネーム</TableHead>
              <TableHead>学年</TableHead>
              <TableHead>チェックイン</TableHead>
              <TableHead>チェックアウト</TableHead>
              <TableHead>状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell className="py-6 text-center text-muted-foreground" colSpan={7}>
                  該当データがありません
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow key={s.sessionId}>
                  <TableCell className="font-mono">{s.participantId}</TableCell>
                  <TableCell>{s.fullName}</TableCell>
                  <TableCell>{s.nickname}</TableCell>
                  <TableCell>{s.grade}</TableCell>
                  <TableCell>{fmtTime(s.checkedInAt)}</TableCell>
                  <TableCell>{s.checkedOutAt ? fmtTime(s.checkedOutAt) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={s.isPresent ? 'default' : 'secondary'}>
                      {s.isPresent ? '来場中' : '退出済'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
