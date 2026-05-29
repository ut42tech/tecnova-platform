'use client';

import {
  IconAlertCircle,
  IconArrowBack,
  IconAward,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCalendarStats,
  IconCircleX,
  IconClock,
  IconDoorEnter,
  IconHistory,
  IconHome,
  IconHourglass,
  IconLogin2,
  IconLogout2,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import type { ParticipantProfileResponse, ScanResponse } from '@tecnova/shared/schemas';
import { TERM_LABELS } from '@tecnova/shared/venue-schedule';
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
import { TermBadge, UncountedBadge } from '@tecnova/ui/components/term-badge';
import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, ViewTransition } from 'react';
import { AnimatedNumber } from '@/components/animated-number';
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

// グリッドは 7 列。最低 6 行（42 タイル）ぶんのマスを敷いて草の下限とする。
// 実際の表示高さはカードを flex で伸ばして横の参加者カードに揃え、あふれた分はタイル内を縦スクロールさせる。
const MIN_ATTENDANCE_TILE_COUNT = 42;

// ヒートマップの pop-in スタッガーの遅延上限（秒）。来場数が多くても演出が間延びしないよう頭打ちにする。
const TILE_STAGGER_MAX_DELAY = 0.5;
const TILE_STAGGER_STEP = 0.012;

const attendanceDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

const attendanceIntensityClasses = [
  'border-slate-200 bg-slate-100',
  'border-emerald-200 bg-emerald-100',
  'border-emerald-300 bg-emerald-300',
  'border-emerald-500 bg-emerald-500',
  'border-emerald-700 bg-emerald-700',
] as const;

// 来場回数ヒートマップは「1 来場 = 1 タイル」。色の濃さはその来場単体の滞在時間で決まる。
type AttendanceTileSlot = {
  key: string;
  label: string;
  stayDurationMinutes: number;
  checkedInAt: string;
  isPresent: boolean;
  termLabel: string | null;
  counted: boolean;
  intensity: number;
};

// その来場の滞在時間（分）を 4 段階に量子化する。3 時間（180分）で最濃。
const getAttendanceIntensity = (minutes: number): number => {
  if (minutes >= 180) return 4;
  if (minutes >= 120) return 3;
  if (minutes >= 60) return 2;
  return 1;
};

const buildAttendanceTiles = (
  sessions: ParticipantProfileResponse['sessions'],
): AttendanceTileSlot[] => {
  // profile.sessions は新しい順で届くため、タイルは古い順に並べ直す。
  return [...sessions]
    .sort((a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime())
    .map((session) => {
      const stayDurationMinutes = session.stayDurationMinutes ?? 0;
      return {
        key: session.sessionId,
        label: attendanceDateFormatter.format(new Date(session.checkedInAt)),
        stayDurationMinutes,
        checkedInAt: session.checkedInAt,
        isPresent: session.isPresent,
        termLabel: session.term ? TERM_LABELS[session.term] : null,
        counted: session.counted,
        intensity: getAttendanceIntensity(stayDurationMinutes),
      };
    });
};

function LoadingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-sky-50 to-white p-6">
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
  const prefersReduced = useReducedMotion();

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
        Icon: IconCalendarPlus,
      },
      {
        label: '最後に来た日',
        value: profile.stats.lastVisitedAt
          ? formatJapaneseDateTimeWithYear(profile.stats.lastVisitedAt)
          : 'まだありません',
        Icon: IconClock,
      },
      {
        label: '累計滞在時間',
        value: formatDuration(profile.stats.totalStayDurationMinutes),
        Icon: IconHourglass,
      },
    ];
  }, [profile]);

  // 参加状況タイル内に並べる内訳。参加回数（スキルカードの押印数）を主役にする。
  const participationBreakdown = useMemo(() => {
    if (!profile) return [];
    return [
      {
        label: '総来場回数',
        value: `${profile.stats.visitCount}回`,
        Icon: IconDoorEnter,
      },
      {
        label: '来場日数',
        value: `${profile.stats.visitDayCount}日`,
        Icon: IconCalendarEvent,
      },
      {
        label: '無効な来場回数',
        value: `${profile.stats.uncountedVisitCount}回`,
        Icon: IconCircleX,
      },
    ];
  }, [profile]);

  const attendanceTiles = useMemo(() => {
    if (!profile) return [];
    return buildAttendanceTiles(profile.sessions);
  }, [profile]);

  const [fillRows, setFillRows] = useState<number | null>(null);

  // lg 以上ではヒートマップカードを横の参加者カードに合わせて伸ばす。空いた高さに収まる行数を実測して
  // その行数ぶんだけ草を敷き詰め、収まらない来場はタイル内を縦スクロールさせる。lg 未満は実測せず静的な下限を使う。
  // React 19 のクリーンアップ付き ref コールバックで、ul の出現／消滅に合わせて監視を着脱する。
  const measureTileGrid = useCallback((node: HTMLUListElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const TILE_GAP = 8; // gap-2 = 0.5rem
    const measure = () => {
      if (!mediaQuery.matches) {
        setFillRows(null);
        return;
      }
      const { clientWidth, clientHeight } = node;
      if (clientWidth === 0 || clientHeight === 0) return;
      const tileSize = (clientWidth - TILE_GAP * 6) / 7; // 7 列・正方形タイル
      const rows = Math.max(1, Math.floor((clientHeight + TILE_GAP) / (tileSize + TILE_GAP)));
      setFillRows(rows);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    mediaQuery.addEventListener('change', measure);
    measure();
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', measure);
    };
  }, []);

  // 表示するマス数。実際の来場行数を下限に、lg は実測行数・それ以外は静的な下限行数まで草で埋める。
  const attendanceTileSlots = useMemo(() => {
    const visitRows = Math.ceil(Math.max(attendanceTiles.length, 1) / 7);
    const baseRows = fillRows ?? Math.ceil(MIN_ATTENDANCE_TILE_COUNT / 7);
    const tileCount = Math.max(visitRows, baseRows) * 7;
    return Array.from({ length: tileCount }, (_, index) => attendanceTiles[index] ?? null);
  }, [attendanceTiles, fillRows]);

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
            { label: '氏名', value: data.fullName },
            { label: 'ニックネーム', value: data.nickname },
            { label: '結果', value: 'チェックインしました' },
            { label: 'チェックイン時刻', value: formatJapaneseDateTime(data.checkedInAt) },
          ]
        : [
            { label: 'ID', value: participantId, valueClassName: 'tabular-nums' },
            { label: '氏名', value: data.fullName },
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
    <main className="flex flex-1 flex-col bg-gradient-to-b from-sky-50 to-white p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ViewTransition name="participant-portal">
            <motion.div
              className="h-full"
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0 }}
            >
              <Card className="h-full border-sky-200 shadow-sm">
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
                        <p className="mt-1 break-words text-lg font-bold text-muted-foreground">
                          {profile.participant.fullName}
                        </p>
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
                    <div
                      className={
                        profile.current.isPresent
                          ? 'flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-base font-bold text-emerald-700'
                          : 'flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-base font-bold text-slate-600'
                      }
                    >
                      {profile.current.isPresent ? (
                        <motion.span
                          className="size-2.5 rounded-full bg-emerald-500"
                          animate={
                            prefersReduced
                              ? undefined
                              : { scale: [1, 1.35, 1], opacity: [1, 0.5, 1] }
                          }
                          transition={
                            prefersReduced
                              ? undefined
                              : { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
                          }
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="size-2.5 rounded-full bg-slate-400" aria-hidden="true" />
                      )}
                      {profile.current.isPresent ? 'チェックイン中' : '未チェックイン'}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                      <IconLogin2 className="size-4" aria-hidden="true" />
                      今日の入室
                    </p>
                    <p className="mt-2 text-xl font-bold">
                      {profile.current.checkedInAt
                        ? formatJapaneseDateTime(profile.current.checkedInAt)
                        : 'まだありません'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 p-5 shadow-sm sm:col-span-2">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                        <IconAward className="size-4" aria-hidden="true" />
                        参加回数
                      </p>
                      <p className="mt-1 text-6xl font-bold leading-none text-emerald-900 tabular-nums">
                        <AnimatedNumber value={profile.stats.participationCount} />
                        <span className="ml-1 text-2xl text-emerald-700">回</span>
                      </p>
                      <dl className="mt-4 grid grid-cols-3 gap-2 border-emerald-200/70 border-t pt-4">
                        {participationBreakdown.map((item) => (
                          <div key={item.label} className="rounded-lg bg-white/70 px-3 py-2">
                            <dt className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                              <item.Icon className="size-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{item.label}</span>
                            </dt>
                            <dd className="mt-1 break-words text-lg font-bold leading-tight tabular-nums">
                              {item.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {stats.map((item) => (
                      <div key={item.label} className="rounded-lg border bg-white p-4">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                          <item.Icon className="size-4 shrink-0" aria-hidden="true" />
                          {item.label}
                        </p>
                        <p className="mt-2 break-words text-2xl font-bold leading-tight">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </ViewTransition>

          <div className="flex flex-col gap-4">
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
            >
              <Card className="h-fit border-sky-200 shadow-sm">
                <PanelHeader
                  icon={
                    isCheckIn ? (
                      <IconLogin2 className="size-8" />
                    ) : (
                      <IconLogout2 className="size-8" />
                    )
                  }
                  title="受付操作"
                  tone={isCheckIn ? 'emerald' : 'amber'}
                />
                <CardContent className="flex flex-col gap-4">
                  <p className="text-lg font-bold text-foreground">
                    {isCheckIn ? '今日はまだチェックインしていません' : 'いまチェックイン中です'}
                  </p>
                  <motion.div
                    className="w-full"
                    whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                  >
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
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              className="lg:flex-1 lg:min-h-0"
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.12 }}
            >
              <Card className="border-sky-200 bg-white shadow-sm lg:h-full">
                <PanelHeader
                  icon={<IconCalendarStats className="size-8" />}
                  title="来場回数"
                  tone="emerald"
                />
                <CardContent className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
                  <div className="flex items-end justify-between gap-4">
                    <p className="text-6xl font-bold leading-none tabular-nums">
                      <AnimatedNumber value={profile.stats.visitCount} />
                      <span className="ml-1 text-3xl">回</span>
                    </p>
                    <div className="mb-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs font-bold text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span>短</span>
                        {[1, 2, 3, 4].map((intensity) => (
                          <span
                            key={intensity}
                            className={`size-4 rounded-[4px] border ${attendanceIntensityClasses[intensity]}`}
                            aria-hidden="true"
                          />
                        ))}
                        <span>長</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <IconX className="size-3.5 text-slate-400" aria-hidden="true" />
                        <span>対象外</span>
                      </span>
                    </div>
                  </div>
                  <ul
                    ref={measureTileGrid}
                    className="grid w-full list-none grid-cols-7 content-start gap-2 overscroll-contain p-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                  >
                    {attendanceTileSlots.map((tile, index) => {
                      const tileEntrance = prefersReduced ? undefined : { opacity: 0, scale: 0.6 };
                      const tileTransition = {
                        duration: 0.25,
                        ease: 'easeOut' as const,
                        delay: Math.min(index * TILE_STAGGER_STEP, TILE_STAGGER_MAX_DELAY),
                      };

                      // 空きスロット（パディング）はニュートラルな空タイル。
                      if (!tile) {
                        return (
                          <motion.li
                            // biome-ignore lint/suspicious/noArrayIndexKey: パディングは静的な位置でしか変化しない
                            key={`empty-${index}`}
                            className={`aspect-square rounded-md border ${attendanceIntensityClasses[0]}`}
                            title="未記録"
                            aria-label="未記録"
                            initial={tileEntrance}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={tileTransition}
                          />
                        );
                      }

                      const baseLabel = `${tile.label}${
                        tile.termLabel ? ` ${tile.termLabel}` : ''
                      } ${formatDuration(tile.stayDurationMinutes)}${tile.isPresent ? ' 経過' : ''}`;

                      // カウント対象外の来場は色を付けず、× アイコンで「来たが無効」を示す。
                      if (!tile.counted) {
                        const label = `${baseLabel}・カウント対象外`;
                        return (
                          <motion.li
                            key={tile.key}
                            className="flex aspect-square items-center justify-center rounded-md border border-slate-200 bg-white"
                            title={label}
                            aria-label={label}
                            initial={tileEntrance}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={tileTransition}
                          >
                            <IconX className="size-3.5 text-slate-400" aria-hidden="true" />
                          </motion.li>
                        );
                      }

                      // カウント対象の来場は滞在時間の濃淡で色付け。
                      return (
                        <motion.li
                          key={tile.key}
                          className={`aspect-square rounded-md border ${attendanceIntensityClasses[tile.intensity]}`}
                          title={baseLabel}
                          aria-label={baseLabel}
                          initial={tileEntrance}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={tileTransition}
                        />
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.18 }}
        >
          <Card className="shadow-sm">
            <PanelHeader
              icon={<IconHistory className="size-8" />}
              title="入退場履歴"
              tone="slate"
            />
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
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{formatJapaneseDateTimeWithYear(session.checkedInAt)}</span>
                              {session.term ? (
                                <TermBadge term={session.term} counted={session.counted} />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
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
                            <div className="flex flex-wrap items-center gap-2">
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
                              {!session.counted && <UncountedBadge />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
