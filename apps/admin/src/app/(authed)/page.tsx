'use client';

import {
  IconCalendarOff,
  IconLogin2,
  IconLogout2,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-react';
import type { EventsListResponse, TodaySessionsResponse } from '@tecnova/shared/schemas';
import { toJstDateString } from '@tecnova/shared/venue-schedule';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { DataError } from '@tecnova/ui/components/data-error';
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
import { TermBadge, UncountedBadge } from '@tecnova/ui/components/term-badge';
import { type ResourceState, useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { useState } from 'react';
import { AnimatedNumber } from '@/components/animated-number';
import { PageHeader } from '@/components/page-header';
import { ParticipantDetailSheet } from '@/components/participant-detail-sheet';
import { RecordCard, RecordField } from '@/components/record-card';
import { Reveal } from '@/components/reveal';

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

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_VALUE);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  // 日付を path に含めることで、選択変更で自動再取得される。更新ボタンは reload()。
  const sessionsPath =
    selectedDate === TODAY_VALUE
      ? '/api/sessions'
      : `/api/sessions?date=${encodeURIComponent(selectedDate)}`;
  const sessions = useApiResource<TodaySessionsResponse>(sessionsPath);

  // イベント一覧は失敗しても致命ではないので、取得できたときだけ使う（エラーは無視）。
  const eventsResource = useApiResource<EventsListResponse>('/api/events');
  const events = eventsResource.state.kind === 'ok' ? eventsResource.state.data.events : [];

  const today = toJstDateString(new Date());
  // 「本日」ラベル + イベントとして登録済みの過去日を結合する。
  // 今日の event が events に含まれていてもメニューの重複は避ける。
  const pastEvents = events.filter((e) => e.date !== today);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <Reveal index={0}>
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
                onClick={() => sessions.reload({ background: true })}
                disabled={sessions.state.kind === 'loading'}
              >
                <IconRefresh data-icon="inline-start" />
                更新
              </Button>
            </>
          }
        />
      </Reveal>

      {/* DashboardBody はフラグメントを返すので、main の gap-6 を保つため Reveal 側で再指定する。
          常時マウントなので入場は一度だけ（再フェッチで再生されない）。 */}
      <Reveal index={1} className="flex flex-col gap-6">
        <DashboardBody
          sessions={sessions.state}
          onSelectParticipant={(id) => setSelectedParticipantId(id)}
        />
      </Reveal>

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
  sessions: ResourceState<TodaySessionsResponse>;
  onSelectParticipant: (id: string) => void;
}) {
  if (sessions.kind === 'loading' || sessions.kind === 'idle') {
    return (
      <>
        <section className="grid grid-cols-3 gap-3 md:gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </section>
        <div className="hidden md:block">
          <TableSkeleton columns={8} rows={6} />
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </>
    );
  }

  if (sessions.kind === 'error') {
    return <DataError title="セッションを読み込めませんでした" message={sessions.message} />;
  }

  const { event, sessions: rows, summary } = sessions.data;

  return (
    <>
      <section className="grid grid-cols-3 gap-3 md:gap-4">
        <SummaryCard label="現在の来場者数" value={summary.currentlyPresent} Icon={IconUserCheck} />
        <SummaryCard
          label="今日の総チェックイン"
          value={summary.totalCheckedIn}
          Icon={IconLogin2}
        />
        <SummaryCard label="チェックアウト済" value={summary.checkedOut} Icon={IconLogout2} />
      </section>
      {/* モバイル: カードリスト */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 ? (
          <EmptySessions hasEvent={event !== null} />
        ) : (
          rows.map((s) => (
            <RecordCard
              key={s.sessionId}
              onClick={() => onSelectParticipant(s.participantId)}
              ariaLabel={`${s.nickname}（${s.grade}・${s.isPresent ? '来場中' : '退出済'}）の詳細を開く`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.nickname}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.fullName}・{s.grade}
                  </p>
                </div>
                <Badge variant={s.isPresent ? 'default' : 'secondary'}>
                  {s.isPresent ? '来場中' : '退出済'}
                </Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {s.term && (
                  <RecordField label="ターム">
                    <span className="inline-flex flex-wrap items-center justify-end gap-1">
                      <TermBadge term={s.term} counted={s.counted} />
                      {!s.counted && <UncountedBadge />}
                    </span>
                  </RecordField>
                )}
                <RecordField label="チェックイン">{fmtTime(s.checkedInAt)}</RecordField>
                <RecordField label="チェックアウト">
                  {s.checkedOutAt ? fmtTime(s.checkedOutAt) : '—'}
                </RecordField>
                <RecordField label="ID">
                  <span className="font-mono text-xs">{s.participantId}</span>
                </RecordField>
              </div>
            </RecordCard>
          ))
        )}
      </div>
      {/* デスクトップ: テーブル */}
      <Card className="hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>氏名</TableHead>
              <TableHead>ニックネーム</TableHead>
              <TableHead>学年</TableHead>
              <TableHead>ターム</TableHead>
              <TableHead>チェックイン</TableHead>
              <TableHead>チェックアウト</TableHead>
              <TableHead>状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
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
                  <TableCell>
                    {s.term ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <TermBadge term={s.term} counted={s.counted} />
                        {!s.counted && <UncountedBadge />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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

function EmptySessions({ hasEvent }: { hasEvent: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-10 text-muted-foreground">
      <IconCalendarOff className="size-8" />
      <span className="px-4 text-center text-sm">
        {hasEvent
          ? 'このイベントのセッションはまだありません'
          : 'この日のイベントはまだ作成されていません'}
      </span>
    </div>
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
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-xs leading-tight font-medium text-muted-foreground sm:text-sm">
          {label}
        </CardTitle>
        <Icon className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold sm:text-3xl">
          <AnimatedNumber value={value} className="tabular-nums" />
        </div>
      </CardContent>
    </Card>
  );
}
