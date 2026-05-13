'use client';

import {
  IconCalendarOff,
  IconLogin2,
  IconLogout2,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-react';
import type { EventsListResponse, TodaySessionsResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
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
import { apiErrorMessage, apiJson } from '@tecnova/ui/lib/api-client';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ParticipantDetailSheet } from '@/components/participant-detail-sheet';

type SessionsState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: TodaySessionsResponse }
  | { kind: 'error'; message: string };

// セレクタで「今日」を選んでいる状態のセンチネル値。
// 空文字や undefined を使うと Select の制御値として扱いにくいのでこの形に。
const TODAY_VALUE = '__today__';

// UTC ISO 文字列を JST の HH:mm 表記に整形する。
const fmtTime = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

// JST の YYYY-MM-DD を返す（events.date と同形）。
const todayInJst = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionsState>({ kind: 'loading' });
  const [events, setEvents] = useState<EventsListResponse['events']>([]);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_VALUE);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  const loadSessions = useCallback(async (dateOrToday: string) => {
    setSessions({ kind: 'loading' });
    try {
      const path =
        dateOrToday === TODAY_VALUE
          ? '/api/sessions'
          : `/api/sessions?date=${encodeURIComponent(dateOrToday)}`;
      const data = await apiJson<TodaySessionsResponse>(path);
      setSessions({ kind: 'ok', data });
    } catch (e) {
      setSessions({ kind: 'error', message: apiErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    // イベント一覧は失敗しても致命ではないので、エラーは表示せず空で続行する。
    void (async () => {
      try {
        const r = await apiJson<EventsListResponse>('/api/events');
        setEvents(r.events);
      } catch {
        setEvents([]);
      }
    })();
  }, []);

  useEffect(() => {
    void loadSessions(selectedDate);
  }, [selectedDate, loadSessions]);

  const today = todayInJst();
  // 「本日」ラベル + イベントとして登録済みの過去日を結合する。
  // 今日の event が events に含まれていてもメニューの重複は避ける。
  const pastEvents = events.filter((e) => e.date !== today);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="ダッシュボード"
        description="開催日ごとのチェックイン状況を確認できます"
        actions={
          <>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-52" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAY_VALUE}>本日（{today}）</SelectItem>
                {pastEvents.map((e) => (
                  <SelectItem key={e.id} value={e.date}>
                    {e.date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadSessions(selectedDate)}
              disabled={sessions.kind === 'loading'}
            >
              <IconRefresh data-icon="inline-start" />
              更新
            </Button>
          </>
        }
      />

      <DashboardBody
        sessions={sessions}
        onSelectParticipant={(id) => setSelectedParticipantId(id)}
      />

      <ParticipantDetailSheet
        participantId={selectedParticipantId}
        onOpenChange={(open) => {
          if (!open) setSelectedParticipantId(null);
        }}
      />
    </main>
  );
}

function DashboardBody({
  sessions,
  onSelectParticipant,
}: {
  sessions: SessionsState;
  onSelectParticipant: (id: string) => void;
}) {
  if (sessions.kind === 'loading') {
    return (
      <>
        <section className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </section>
        <TableSkeleton columns={7} rows={6} />
      </>
    );
  }

  if (sessions.kind === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>セッションを読み込めませんでした</AlertTitle>
        <AlertDescription>{sessions.message}</AlertDescription>
      </Alert>
    );
  }

  const { event, sessions: rows, summary } = sessions.data;

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="現在の来場者数" value={summary.currentlyPresent} Icon={IconUserCheck} />
        <SummaryCard
          label="今日の総チェックイン"
          value={summary.totalCheckedIn}
          Icon={IconLogin2}
        />
        <SummaryCard label="チェックアウト済" value={summary.checkedOut} Icon={IconLogout2} />
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <IconCalendarOff className="size-8" />
                    <span className="text-sm">
                      {event
                        ? 'このイベントのセッションはまだありません'
                        : 'この日のイベントはまだ作成されていません'}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => (
                <TableRow
                  key={s.sessionId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectParticipant(s.participantId)}
                >
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
    </>
  );
}

function SummaryCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number;
  Icon: typeof IconUserCheck;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
