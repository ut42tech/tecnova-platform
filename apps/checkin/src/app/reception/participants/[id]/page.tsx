'use client';

import {
  IconAlertCircle,
  IconArrowBack,
  IconCalendarStats,
  IconHistory,
  IconHome,
  IconLogin2,
  IconLogout2,
  IconUser,
} from '@tabler/icons-react';
import type { ParticipantProfileResponse, ScanResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
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
import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { ResultSummaryCard } from '@/components/result-summary-card';
import {
  formatDuration,
  formatJapaneseDateFromIso,
  formatJapaneseDateTime,
  formatJapaneseDateTimeWithYear,
} from '@/lib/format';
import { PARTICIPANT_ID_PATTERN } from '@/lib/participant-id';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: ParticipantProfileResponse }
  | { kind: 'submitting'; profile: ParticipantProfileResponse }
  | { kind: 'result'; data: ScanResponse }
  | { kind: 'error'; message: string };

const fetchParticipantProfile = async (
  participantId: string,
): Promise<ParticipantProfileResponse> => {
  const response = await apiFetch(`/checkin/participants/${participantId}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as ParticipantProfileResponse;
};

const postAttendance = async (participantId: string): Promise<ScanResponse> => {
  const response = await apiFetch(`/checkin/participants/${participantId}/attendance`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as ScanResponse;
};

const formatHistoryDuration = (minutes: number | null, isPresent: boolean): string => {
  if (minutes === null) return '記録なし';
  return isPresent ? `${formatDuration(minutes)} 経過` : formatDuration(minutes);
};

const MIN_ATTENDANCE_TILE_COUNT = 35;

const attendanceDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

const attendanceDateKeyFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const attendanceIntensityClasses = [
  'border-slate-200 bg-slate-100',
  'border-emerald-200 bg-emerald-100',
  'border-emerald-300 bg-emerald-300',
  'border-emerald-500 bg-emerald-500',
  'border-emerald-700 bg-emerald-700',
] as const;

type AttendanceTile = {
  key: string;
  label: string;
  stayDurationMinutes: number;
  firstCheckedInAt: string;
  isPresent: boolean;
};

type AttendanceTileSlot = AttendanceTile & {
  intensity: number;
};

const formatAttendanceDateKey = (value: string): string => {
  const parts = attendanceDateKeyFormatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
};

const getAttendanceIntensity = (minutes: number): number => {
  if (minutes >= 360) return 4;
  if (minutes >= 180) return 3;
  if (minutes >= 60) return 2;
  return 1;
};

const buildAttendanceTiles = (
  sessions: ParticipantProfileResponse['sessions'],
): AttendanceTileSlot[] => {
  const visitsByDate = new Map<string, AttendanceTile>();

  for (const session of sessions) {
    const key = formatAttendanceDateKey(session.checkedInAt);
    const checkedInAtMs = new Date(session.checkedInAt).getTime();
    const stayDurationMinutes = session.stayDurationMinutes ?? 0;
    const existing = visitsByDate.get(key);

    if (!existing) {
      visitsByDate.set(key, {
        key,
        label: attendanceDateFormatter.format(new Date(session.checkedInAt)),
        stayDurationMinutes,
        firstCheckedInAt: session.checkedInAt,
        isPresent: session.isPresent,
      });
      continue;
    }

    const existingCheckedInAtMs = new Date(existing.firstCheckedInAt).getTime();
    visitsByDate.set(key, {
      ...existing,
      stayDurationMinutes: existing.stayDurationMinutes + stayDurationMinutes,
      firstCheckedInAt:
        checkedInAtMs < existingCheckedInAtMs ? session.checkedInAt : existing.firstCheckedInAt,
      isPresent: existing.isPresent || session.isPresent,
    });
  }

  return Array.from(visitsByDate.values())
    .sort((a, b) => new Date(a.firstCheckedInAt).getTime() - new Date(b.firstCheckedInAt).getTime())
    .map((visit) => ({
      ...visit,
      intensity: getAttendanceIntensity(visit.stayDurationMinutes),
    }));
};

const buildAttendanceTileSlots = (
  visits: AttendanceTileSlot[],
): Array<AttendanceTileSlot | null> => {
  const tileCount = Math.max(
    MIN_ATTENDANCE_TILE_COUNT,
    Math.ceil(Math.max(visits.length, 1) / 7) * 7,
  );
  return Array.from({ length: tileCount }, (_, index) => visits[index] ?? null);
};

function LoadingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center bg-sky-50 p-6">
      <Card className="w-full max-w-3xl border-sky-200 shadow-sm">
        <CardHeader className="gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-7 w-44" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </CardContent>
      </Card>
    </main>
  );
}

function ErrorScreen({ message, participantId }: { message: string; participantId: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>参加者を表示できません</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-16 text-xl">
          <Link href="/">
            <IconHome className="size-6" data-icon="inline-start" />
            ホームに戻る
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
          <Link href="/manual">
            <IconArrowBack className="size-6" data-icon="inline-start" />
            入力し直す
          </Link>
        </Button>
      </div>
      <p className="text-base font-bold text-rose-900/70 tabular-nums">ID {participantId}</p>
    </main>
  );
}

export default function ReceptionParticipantPage() {
  const params = useParams<{ id: string }>();
  const participantId = String(params.id ?? '');
  const [state, setState] = useState<State>({ kind: 'loading' });

  const loadProfile = useCallback(async () => {
    if (!PARTICIPANT_ID_PATTERN.test(participantId)) {
      setState({ kind: 'error', message: '5桁の参加者IDを入力してください' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const profile = await fetchParticipantProfile(participantId);
      setState({ kind: 'ready', profile });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [participantId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const profile = state.kind === 'ready' || state.kind === 'submitting' ? state.profile : null;
  const isSubmitting = state.kind === 'submitting';
  const nextAction = profile?.current.nextAction ?? 'check_in';
  const isCheckIn = nextAction === 'check_in';

  const stats = useMemo(() => {
    if (!profile) return [];
    return [
      {
        label: '登録日',
        value: formatJapaneseDateFromIso(profile.participant.activatedAt),
      },
      {
        label: '最後に来た日',
        value: profile.stats.lastVisitedAt
          ? formatJapaneseDateTimeWithYear(profile.stats.lastVisitedAt)
          : 'まだありません',
      },
      {
        label: '来場回数',
        value: `${profile.stats.visitCount}回`,
      },
      {
        label: '累計滞在時間',
        value: formatDuration(profile.stats.totalStayDurationMinutes),
      },
    ];
  }, [profile]);

  const attendanceTiles = useMemo(() => {
    if (!profile) return [];
    return buildAttendanceTiles(profile.sessions);
  }, [profile]);

  const attendanceTileSlots = useMemo(
    () => buildAttendanceTileSlots(attendanceTiles),
    [attendanceTiles],
  );

  const submitAttendance = async () => {
    if (!profile) return;
    setState({ kind: 'submitting', profile });
    try {
      const data = await postAttendance(profile.participant.id);
      setState({ kind: 'result', data });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state.kind === 'loading') {
    return <LoadingScreen />;
  }

  if (state.kind === 'error') {
    return <ErrorScreen message={state.message} participantId={participantId} />;
  }

  if (state.kind === 'result') {
    const data = state.data;
    const didCheckIn = data.action === 'check_in';
    const resultRows =
      data.action === 'check_in'
        ? [
            { label: 'ID', value: participantId, valueClassName: 'tabular-nums' },
            { label: 'ニックネーム', value: data.nickname },
            { label: '結果', value: 'チェックインしました' },
            { label: 'チェックイン時刻', value: formatJapaneseDateTime(data.checkedInAt) },
          ]
        : [
            { label: 'ID', value: participantId, valueClassName: 'tabular-nums' },
            { label: 'ニックネーム', value: data.nickname },
            { label: '結果', value: 'チェックアウトしました' },
            { label: '滞在時間', value: formatDuration(data.stayDurationMinutes) },
          ];
    return (
      <ResultSummaryCard
        title={didCheckIn ? 'チェックイン' : 'チェックアウト'}
        tone={didCheckIn ? 'emerald' : 'amber'}
        icon={didCheckIn ? <IconLogin2 className="size-8" /> : <IconLogout2 className="size-8" />}
        rows={resultRows}
        footer={
          <Button asChild size="lg" className="h-16 w-full text-xl">
            <Link href="/">
              <IconHome className="size-6" data-icon="inline-start" />
              ホームに戻る
            </Link>
          </Button>
        }
      />
    );
  }

  if (!profile) return null;

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-sky-200 shadow-sm">
            <CardContent className="flex h-full flex-col gap-6 p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <IconUser className="size-11" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="break-words text-4xl leading-tight sm:text-5xl">
                      {profile.participant.nickname}
                    </CardTitle>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        style={{ height: 'auto' }}
                        className="px-4 py-2 text-base tabular-nums"
                      >
                        ID {profile.participant.id}
                      </Badge>
                      <Badge
                        variant="secondary"
                        style={{ height: 'auto' }}
                        className="px-4 py-2 text-base"
                      >
                        {profile.participant.grade}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  style={{ height: 'auto' }}
                  className={
                    profile.current.isPresent
                      ? 'w-fit bg-emerald-100 px-4 py-2 text-base text-emerald-700'
                      : 'w-fit bg-slate-100 px-4 py-2 text-base text-slate-700'
                  }
                >
                  {profile.current.isPresent ? 'チェックイン中' : '未チェックイン'}
                </Badge>
              </div>

              <div className="grid gap-3">
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-sm font-bold text-muted-foreground">今日の入室</p>
                  <p className="mt-2 text-xl font-bold">
                    {profile.current.checkedInAt
                      ? formatJapaneseDateTime(profile.current.checkedInAt)
                      : 'まだありません'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-lg border bg-white p-4">
                    <p className="text-sm font-bold text-muted-foreground">{item.label}</p>
                    <p className="mt-2 break-words text-2xl font-bold leading-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="h-fit border-sky-200 shadow-sm">
              <PanelHeader
                icon={
                  isCheckIn ? <IconLogin2 className="size-8" /> : <IconLogout2 className="size-8" />
                }
                title="受付操作"
                tone={isCheckIn ? 'emerald' : 'amber'}
              />
              <CardContent className="flex flex-col gap-4">
                <p className="text-lg font-bold text-foreground">
                  {isCheckIn ? '今日はまだチェックインしていません' : 'いまチェックイン中です'}
                </p>
                <Button
                  type="button"
                  size="lg"
                  disabled={isSubmitting}
                  onClick={() => void submitAttendance()}
                  className={
                    isCheckIn
                      ? 'h-20 w-full text-2xl'
                      : 'h-20 w-full bg-amber-500 text-2xl text-white hover:bg-amber-600'
                  }
                >
                  {isCheckIn ? (
                    <IconLogin2 className="size-8" data-icon="inline-start" />
                  ) : (
                    <IconLogout2 className="size-8" data-icon="inline-start" />
                  )}
                  {isSubmitting
                    ? '記録しています'
                    : isCheckIn
                      ? 'チェックインする'
                      : 'チェックアウトする'}
                </Button>
              </CardContent>
            </Card>

            <Card className="h-fit border-sky-200 bg-white shadow-sm">
              <PanelHeader
                icon={<IconCalendarStats className="size-8" />}
                title="来場日数"
                tone="emerald"
              />
              <CardContent className="space-y-5">
                <div className="flex items-end justify-between gap-4">
                  <p className="text-6xl font-bold leading-none tabular-nums">
                    {attendanceTiles.length}
                    <span className="ml-1 text-3xl">日</span>
                  </p>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <span>短</span>
                    {[1, 2, 3, 4].map((intensity) => (
                      <span
                        key={intensity}
                        className={`size-4 rounded-[4px] border ${attendanceIntensityClasses[intensity]}`}
                        aria-hidden="true"
                      />
                    ))}
                    <span>長</span>
                  </div>
                </div>
                <ul className="grid w-full list-none grid-cols-7 gap-2 p-0">
                  {attendanceTileSlots.map((tile, index) => {
                    const label = tile
                      ? `${tile.label} ${formatDuration(tile.stayDurationMinutes)}${
                          tile.isPresent ? ' 経過' : ''
                        }`
                      : '未記録';
                    return (
                      <li
                        key={tile?.key ?? `empty-${index}`}
                        className={`aspect-square rounded-md border ${attendanceIntensityClasses[tile?.intensity ?? 0]}`}
                        title={label}
                        aria-label={label}
                      />
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="shadow-sm">
          <PanelHeader icon={<IconHistory className="size-8" />} title="入退場履歴" tone="slate" />
          <CardContent>
            {profile.sessions.length === 0 ? (
              <div className="rounded-lg border bg-white p-6 text-lg font-bold text-muted-foreground">
                履歴はまだありません
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-44">入室</TableHead>
                      <TableHead className="min-w-44">退室</TableHead>
                      <TableHead className="min-w-32">滞在時間</TableHead>
                      <TableHead className="min-w-32">状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-base">
                    {profile.sessions.map((session) => (
                      <TableRow key={session.sessionId}>
                        <TableCell className="font-bold">
                          {formatJapaneseDateTimeWithYear(session.checkedInAt)}
                        </TableCell>
                        <TableCell className="font-bold">
                          {session.checkedOutAt
                            ? formatJapaneseDateTimeWithYear(session.checkedOutAt)
                            : '未退室'}
                        </TableCell>
                        <TableCell className="font-bold">
                          {formatHistoryDuration(session.stayDurationMinutes, session.isPresent)}
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
                      </TableRow>
                    ))}
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
