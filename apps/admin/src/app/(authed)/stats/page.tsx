'use client';

import {
  IconCalendarOff,
  IconCalendarStats,
  IconChartBar,
  IconClockHour12,
  IconSunHigh,
  IconSunset2,
} from '@tabler/icons-react';
import type { ParticipationSummaryResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
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
import { formatJstDate } from '@tecnova/ui/lib/format';
import { cn } from '@tecnova/ui/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';

type SummaryState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: ParticipationSummaryResponse }
  | { kind: 'error'; message: string };

export default function StatsPage() {
  const [summary, setSummary] = useState<SummaryState>({ kind: 'loading' });
  // 入力中の値（適用ボタンを押すまで反映しない）。空文字 = フィルタなし。
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  // 実際に API へ送る確定済みレンジ。
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const loadSummary = useCallback(async (from: string, to: string) => {
    setSummary({ kind: 'loading' });
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString();
      const path = query ? `/api/stats/participation?${query}` : '/api/stats/participation';
      const data = await apiJson<ParticipationSummaryResponse>(path);
      setSummary({ kind: 'ok', data });
    } catch (e) {
      setSummary({ kind: 'error', message: apiErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void loadSummary(appliedFrom, appliedTo);
  }, [appliedFrom, appliedTo, loadSummary]);

  const applyFilter = () => {
    setAppliedFrom(fromInput);
    setAppliedTo(toInput);
  };

  const clearFilter = () => {
    setFromInput('');
    setToInput('');
    setAppliedFrom('');
    setAppliedTo('');
  };

  const hasFilter = appliedFrom !== '' || appliedTo !== '';

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="集計"
        description="ターム単位の参加回数を期間で集計します"
        actions={
          <>
            <Input
              type="date"
              aria-label="集計開始日"
              value={fromInput}
              max={toInput || undefined}
              onChange={(e) => setFromInput(e.target.value)}
              className="w-40"
            />
            <span className="text-sm text-muted-foreground">〜</span>
            <Input
              type="date"
              aria-label="集計終了日"
              value={toInput}
              min={fromInput || undefined}
              onChange={(e) => setToInput(e.target.value)}
              className="w-40"
            />
            <Button
              type="button"
              size="sm"
              onClick={applyFilter}
              disabled={summary.kind === 'loading'}
            >
              適用
            </Button>
            {hasFilter && (
              <Button type="button" variant="outline" size="sm" onClick={clearFilter}>
                全期間
              </Button>
            )}
          </>
        }
      />

      <StatsBody summary={summary} />
    </main>
  );
}

function StatsBody({ summary }: { summary: SummaryState }) {
  if (summary.kind === 'loading') {
    return (
      <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </section>
        <TableSkeleton columns={5} rows={8} />
      </>
    );
  }

  if (summary.kind === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>集計を読み込めませんでした</AlertTitle>
        <AlertDescription>{summary.message}</AlertDescription>
      </Alert>
    );
  }

  const { totals, byDate } = summary.data;

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="総参加回数"
          value={totals.total}
          Icon={IconChartBar}
          className="col-span-2 md:col-span-1"
        />
        <SummaryCard
          label="朝"
          value={totals.morning}
          Icon={IconSunHigh}
          iconClassName="text-sky-600"
        />
        <SummaryCard
          label="昼"
          value={totals.afternoon}
          Icon={IconClockHour12}
          iconClassName="text-amber-600"
        />
        <SummaryCard
          label="夕方"
          value={totals.evening}
          Icon={IconSunset2}
          iconClassName="text-violet-600"
        />
        <SummaryCard label="開催日数" value={totals.days} Icon={IconCalendarStats} />
      </section>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>開催日</TableHead>
              <TableHead className="text-right">朝</TableHead>
              <TableHead className="text-right">昼</TableHead>
              <TableHead className="text-right">夕方</TableHead>
              <TableHead className="text-right">計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byDate.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <IconCalendarOff className="size-8" />
                    <span className="text-sm">この期間の参加実績はありません</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              byDate.map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{formatJstDate(row.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.morning}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.afternoon}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.evening}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
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
  iconClassName,
  className,
}: {
  label: string;
  value: number;
  Icon: typeof IconChartBar;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-xs leading-tight font-medium text-muted-foreground sm:text-sm">
          {label}
        </CardTitle>
        <Icon
          className={cn('hidden size-5 shrink-0 text-muted-foreground sm:block', iconClassName)}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold sm:text-3xl">{value}</div>
      </CardContent>
    </Card>
  );
}
