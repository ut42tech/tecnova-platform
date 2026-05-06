'use client';

import {
  IconAlertCircle,
  IconArrowBack,
  IconClipboardCheck,
  IconHome,
  IconLogout2,
  IconRefresh,
  IconUser,
} from '@tabler/icons-react';
import type {
  HistoryBulkCheckOutResponse,
  TodaySessionItem,
  TodaySessionsResponse,
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
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tecnova/ui/components/alert-dialog';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription } from '@tecnova/ui/components/card';
import { Checkbox } from '@tecnova/ui/components/checkbox';
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
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { apiFetch, readErrorMessage } from '@/lib/api';
import {
  formatDuration,
  formatJapaneseDate,
  formatJapaneseDateTime,
  formatJapaneseDateTimeWithYear,
} from '@/lib/format';
import { participantProfilePath } from '@/lib/participant-id';

const fetchTodayHistory = async (): Promise<TodaySessionsResponse> => {
  const response = await apiFetch('/checkin/history/today', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as TodaySessionsResponse;
};

const postHistoryBulkCheckOut = async (
  participantIds: string[],
): Promise<HistoryBulkCheckOutResponse> => {
  const response = await apiFetch('/checkin/history/check-out-bulk', {
    method: 'POST',
    body: { participantIds },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as HistoryBulkCheckOutResponse;
};

const getSessionStayDurationMinutes = (session: TodaySessionItem, nowMs: number): number => {
  const checkedInAtMs = new Date(session.checkedInAt).getTime();
  const checkedOutAtMs = session.checkedOutAt ? new Date(session.checkedOutAt).getTime() : nowMs;
  return Math.max(0, Math.floor((checkedOutAtMs - checkedInAtMs) / 60_000));
};

function LoadingScreen() {
  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <Card className="border-sky-200 shadow-sm">
          <CardContent className="grid gap-4 p-6">
            <Skeleton className="h-14 w-72" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
            <Skeleton className="h-80 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>履歴を表示できません</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-16 text-xl">
          <Link href="/">
            <IconHome className="size-6" data-icon="inline-start" />
            ホームに戻る
          </Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onRetry}
          className="h-16 text-xl"
        >
          <IconRefresh className="size-6" data-icon="inline-start" />
          再読み込み
        </Button>
      </div>
    </main>
  );
}

function CheckoutDialog({
  buttonLabel,
  count,
  disabled,
  onConfirm,
}: {
  buttonLabel: string;
  count: number;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="lg"
          disabled={disabled}
          className="h-14 w-full bg-amber-500 text-lg text-white hover:bg-amber-600 sm:w-auto"
        >
          <IconLogout2 className="size-6" data-icon="inline-start" />
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-amber-100 text-amber-700">
            <IconLogout2 className="size-9" aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{count}人をチェックアウトしますか</AlertDialogTitle>
          <AlertDialogDescription>
            現在滞在中の参加者だけが退室済みになります。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">キャンセル</AlertDialogCancel>
          <AlertDialogAction size="lg" onClick={() => void onConfirm()}>
            チェックアウトする
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function HistoryPage() {
  const [data, setData] = useState<TodaySessionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<HistoryBulkCheckOutResponse | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadSessions = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (showLoading) setIsLoading(true);
      setError(null);
      try {
        const result = await fetchTodayHistory();
        setData(result);
        setSelectedIds((ids) =>
          ids.filter((id) =>
            result.sessions.some((session) => session.isPresent && session.participantId === id),
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const sessions = data?.sessions ?? [];
  const presentIds = useMemo(
    () => sessions.filter((session) => session.isPresent).map((session) => session.participantId),
    [sessions],
  );
  const presentIdSet = useMemo(() => new Set(presentIds), [presentIds]);
  const selectedPresentIds = useMemo(
    () => selectedIds.filter((id) => presentIdSet.has(id)),
    [presentIdSet, selectedIds],
  );
  const selectedIdSet = useMemo(() => new Set(selectedPresentIds), [selectedPresentIds]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sessions
      .filter((session) => {
        if (!normalizedQuery) return true;
        return (
          session.participantId.includes(normalizedQuery) ||
          session.nickname.toLowerCase().includes(normalizedQuery) ||
          session.grade.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;
        return new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime();
      });
  }, [query, sessions]);

  const filteredPresentIds = useMemo(
    () =>
      filteredSessions
        .filter((session) => session.isPresent)
        .map((session) => session.participantId),
    [filteredSessions],
  );
  const allFilteredPresentSelected =
    filteredPresentIds.length > 0 &&
    filteredPresentIds.every((participantId) => selectedIdSet.has(participantId));

  const toggleParticipant = (participantId: string, checked: boolean) => {
    setSelectedIds((ids) => {
      if (checked) return Array.from(new Set([...ids, participantId]));
      return ids.filter((id) => id !== participantId);
    });
  };

  const toggleFilteredPresent = (checked: boolean) => {
    setSelectedIds((ids) => {
      if (!checked) return ids.filter((id) => !filteredPresentIds.includes(id));
      return Array.from(new Set([...ids, ...filteredPresentIds]));
    });
  };

  const checkoutParticipants = async (participantIds: string[]) => {
    const targetIds = Array.from(new Set(participantIds)).filter((id) => presentIdSet.has(id));
    if (targetIds.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await postHistoryBulkCheckOut(targetIds);
      setLastResult(result);
      setSelectedIds([]);
      await loadSessions({ showLoading: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error && !data) {
    return <ErrorScreen message={error} onRetry={() => void loadSessions()} />;
  }

  const summary = data?.summary ?? { totalCheckedIn: 0, currentlyPresent: 0, checkedOut: 0 };
  const eventLabel = data?.event ? formatJapaneseDate(data.event.date) : '今日';

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <Card className="border-sky-200 shadow-sm">
          <PanelHeader
            icon={<IconClipboardCheck className="size-8" />}
            title="受付りれき"
            tone="sky"
          />
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <CardDescription className="text-lg text-foreground">
                  {eventLabel}の受付履歴と参加者の状態を確認できます。
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={isSubmitting}
                  onClick={() => void loadSessions({ showLoading: false })}
                  className="h-14 text-lg"
                >
                  <IconRefresh className="size-6" data-icon="inline-start" />
                  更新
                </Button>
                <CheckoutDialog
                  buttonLabel="滞在中全員をチェックアウト"
                  count={presentIds.length}
                  disabled={presentIds.length === 0 || isSubmitting}
                  onConfirm={() => void checkoutParticipants(presentIds)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-white p-4">
                <p className="text-sm font-bold text-muted-foreground">今日の受付</p>
                <p className="mt-2 text-4xl font-black tabular-nums">
                  {summary.totalCheckedIn}
                  <span className="ml-1 text-2xl">人</span>
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-700">滞在中</p>
                <p className="mt-2 text-4xl font-black text-emerald-700 tabular-nums">
                  {summary.currentlyPresent}
                  <span className="ml-1 text-2xl">人</span>
                </p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <p className="text-sm font-bold text-muted-foreground">退室済み</p>
                <p className="mt-2 text-4xl font-black tabular-nums">
                  {summary.checkedOut}
                  <span className="ml-1 text-2xl">人</span>
                </p>
              </div>
            </div>

            {lastResult && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                <IconLogout2 className="size-5" aria-hidden="true" />
                <AlertTitle>チェックアウトしました</AlertTitle>
                <AlertDescription>
                  {lastResult.checkedOutCount}人を
                  {formatJapaneseDateTime(lastResult.checkedOutAt)}にチェックアウトしました。
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="size-5" aria-hidden="true" />
                <AlertTitle>処理できませんでした</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <Input
                aria-label="参加者検索"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ID・ニックネーム・学年で検索"
                className="h-14 rounded-lg bg-white px-5 text-lg"
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={filteredPresentIds.length === 0 || isSubmitting}
                  onClick={() => toggleFilteredPresent(!allFilteredPresentSelected)}
                  className="h-14 text-lg"
                >
                  {allFilteredPresentSelected ? '表示中の選択を解除' : '表示中の滞在者を選択'}
                </Button>
                <CheckoutDialog
                  buttonLabel={`選択中 ${selectedPresentIds.length}人をチェックアウト`}
                  count={selectedPresentIds.length}
                  disabled={selectedPresentIds.length === 0 || isSubmitting}
                  onConfirm={() => void checkoutParticipants(selectedPresentIds)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-0">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <IconUser className="size-9" aria-hidden="true" />
                </div>
                <p className="text-xl font-bold text-muted-foreground">
                  表示できる参加者はいません
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">
                        <Checkbox
                          aria-label="表示中の滞在者を選択"
                          checked={allFilteredPresentSelected}
                          disabled={filteredPresentIds.length === 0 || isSubmitting}
                          onCheckedChange={(checked) => toggleFilteredPresent(checked === true)}
                          className="size-6 rounded-md"
                        />
                      </TableHead>
                      <TableHead className="min-w-48">参加者</TableHead>
                      <TableHead className="min-w-36">状態</TableHead>
                      <TableHead className="min-w-44">受付時刻</TableHead>
                      <TableHead className="min-w-36">滞在時間</TableHead>
                      <TableHead className="min-w-36">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-base">
                    {filteredSessions.map((session) => {
                      const stayDurationMinutes = getSessionStayDurationMinutes(session, nowMs);
                      return (
                        <TableRow key={session.sessionId}>
                          <TableCell>
                            {session.isPresent ? (
                              <Checkbox
                                aria-label={`${session.nickname}を選択`}
                                checked={selectedIdSet.has(session.participantId)}
                                disabled={isSubmitting}
                                onCheckedChange={(checked) =>
                                  toggleParticipant(session.participantId, checked === true)
                                }
                                className="size-6 rounded-md"
                              />
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="break-words text-lg font-bold">
                                {session.nickname}
                              </span>
                              <span className="text-sm font-bold text-muted-foreground">
                                <span className="tabular-nums">ID {session.participantId}</span>
                                <span className="mx-2">/</span>
                                {session.grade}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              style={{ height: 'auto' }}
                              className={
                                session.isPresent
                                  ? 'bg-emerald-100 px-3 py-1.5 text-emerald-700'
                                  : 'px-3 py-1.5'
                              }
                            >
                              {session.isPresent ? '滞在中' : '退室済み'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">
                            {formatJapaneseDateTimeWithYear(session.checkedInAt)}
                          </TableCell>
                          <TableCell className="font-bold">
                            {session.isPresent
                              ? `${formatDuration(stayDurationMinutes)} 経過`
                              : formatDuration(stayDurationMinutes)}
                          </TableCell>
                          <TableCell>
                            <Button asChild variant="outline" size="lg" className="h-12 text-base">
                              <Link href={participantProfilePath(session.participantId)}>
                                <IconArrowBack className="size-5" data-icon="inline-start" />
                                ステータス
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
