'use client';

import {
  IconArrowLeft,
  IconBook,
  IconBottle,
  IconCar,
  IconChartBar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconClipboardCheck,
  IconDoorExit,
  IconHeartHandshake,
  IconHome,
  IconMessageCircleX,
  IconRefresh,
  IconShieldCheck,
  IconTargetArrow,
  IconTools,
  IconUsersGroup,
} from '@tabler/icons-react';
import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
} from '@tecnova/shared/schemas';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent } from '@tecnova/ui/components/card';
import { Checkbox } from '@tecnova/ui/components/checkbox';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@tecnova/ui/components/table';
import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { apiFetch } from '@tecnova/ui/lib/api-client';
import { cn } from '@tecnova/ui/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { PanelHeader } from '@/components/panel-header';
import { ResultSummaryCard } from '@/components/result-summary-card';
import { CheckinErrorScreen } from '@/components/screen-error';
import { formatJapaneseDate, formatJapaneseDateTime } from '@/lib/format';

// 取得（pre-registered 一覧）は useApiResource。ここはアクティベート POST の
// ワークフロー状態のみ（取得状態とは分離）。
type MutationState =
  | { kind: 'idle' }
  | { kind: 'activating'; item: PreRegisteredParticipant }
  | { kind: 'result'; data: ActivateResponse; registeredAt: string }
  | { kind: 'error'; message: string; item: PreRegisteredParticipant };

type GuidelineTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';

type GuidelineSlide = {
  section: string;
  label: string;
  rule: string;
  tone: GuidelineTone;
  icon: ReactNode;
};

// 左に「アイコン＋タイトル」の1枚カード、右に本文。色はトーンで穏やかに差をつける。
// chip=セクション札 / card=左カードの淡背景＋枠 / iconCircle=カード内アイコン円 / kicker=タイトル色 / bar=進捗
const guidelineToneClasses: Record<
  GuidelineTone,
  {
    chip: string;
    card: string;
    iconCircle: string;
    kicker: string;
    bar: string;
  }
> = {
  emerald: {
    chip: 'bg-emerald-100 text-emerald-700',
    card: 'border-emerald-100 bg-emerald-50',
    iconCircle: 'bg-white text-emerald-600 ring-1 ring-emerald-100',
    kicker: 'text-emerald-700',
    bar: 'bg-emerald-500',
  },
  sky: {
    chip: 'bg-sky-100 text-sky-700',
    card: 'border-sky-100 bg-sky-50',
    iconCircle: 'bg-white text-sky-600 ring-1 ring-sky-100',
    kicker: 'text-sky-700',
    bar: 'bg-sky-500',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-800',
    card: 'border-amber-100 bg-amber-50',
    iconCircle: 'bg-white text-amber-600 ring-1 ring-amber-100',
    kicker: 'text-amber-700',
    bar: 'bg-amber-500',
  },
  rose: {
    chip: 'bg-rose-100 text-rose-700',
    card: 'border-rose-100 bg-rose-50',
    iconCircle: 'bg-white text-rose-600 ring-1 ring-rose-100',
    kicker: 'text-rose-700',
    bar: 'bg-rose-500',
  },
  slate: {
    chip: 'bg-slate-200 text-slate-700',
    card: 'border-slate-200 bg-slate-50',
    iconCircle: 'bg-white text-slate-600 ring-1 ring-slate-200',
    kicker: 'text-slate-700',
    bar: 'bg-slate-500',
  },
};

const GUIDELINE_SLIDES: GuidelineSlide[] = [
  {
    section: 'テクノバでのすごしかた',
    label: '受付と名札',
    rule: '到着したら受付をして、初回に作成したテクノバファイルを受け取り、ネームカードを着用してください。',
    tone: 'sky',
    icon: <IconClipboardCheck className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '活動の記録',
    rule: '毎回の活動時には「目標設定」と「振り返り」を記録しましょう。',
    tone: 'emerald',
    icon: <IconTargetArrow className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '途中退室',
    rule: '一時的に部屋から出るときは、必ずメンターに伝えてください。',
    tone: 'sky',
    icon: <IconDoorExit className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: 'かえるとき',
    rule: 'かえるときは活動内容を記録してメンターに報告し、テクノバファイルとネームカードを置いてかえってください。',
    tone: 'emerald',
    icon: <IconHome className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '人を大切に',
    rule: '人を傷つけたり、怒らせるようなことはやめましょう。ケンカなど自分たちで解決できない問題が起きたら、すぐに先生やメンターに相談してください。',
    tone: 'rose',
    icon: <IconHeartHandshake className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '物を大切に',
    rule: '作品や機材を大切にしましょう。機材はゆずり合って使い、使ったものは必ず元の場所に片付けましょう。',
    tone: 'emerald',
    icon: <IconTools className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '安全な利用',
    rule: 'ケガにつながる機材もあるので、メンターの注意をよく聞いて安全に使いましょう。何かをダウンロード・アップロードするときは、かならずメンターに聞いてください。',
    tone: 'amber',
    icon: <IconShieldCheck className="size-16" />,
  },
  {
    section: 'テクノバでのすごしかた',
    label: '体調管理',
    rule: '体調管理のために、飲み物を持参しましょう。1時間に1回は休憩しましょう。',
    tone: 'sky',
    icon: <IconBottle className="size-16" />,
  },
  {
    section: '保護者の方へ',
    label: '保護者同伴のお願い',
    rule: '小学1年生〜4年生は、保護者の方も一緒にご来場ください。',
    tone: 'amber',
    icon: <IconUsersGroup className="size-16" />,
  },
  {
    section: '保護者の方へ',
    label: '送り迎えについて',
    rule: '遅い時間帯（小学生の場合は18時以降）に参加される際は、保護者の方が送り迎えいただきますようお願いします。※専用の駐車場はありませんのでご注意ください。',
    tone: 'amber',
    icon: <IconCar className="size-16" />,
  },
  {
    section: '保護者の方へ',
    label: 'データの活用について',
    rule: '参加状況の記録や、子どもたちが記入する「目標設定と振り返り」のデータは、匿名化した上で、より良い運営等のために役立てさせていただきます。ご理解とご協力のほどよろしくお願いいたします。',
    tone: 'slate',
    icon: <IconChartBar className="size-16" />,
  },
  {
    section: '保護者の方へ',
    label: 'SNSのルール',
    rule: 'トラブル防止のため、メンターと利用者のSNS等連絡先の交換は禁止させていただきます。また、許可なく他の人の姿や作品などをSNSに投稿しないようご配慮ください。',
    tone: 'rose',
    icon: <IconMessageCircleX className="size-16" />,
  },
];

function ParticipantDetails({ item }: { item: PreRegisteredParticipant }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableBody className="text-base sm:text-lg">
          <TableRow>
            <TableCell className="w-36 bg-muted/40 font-bold text-muted-foreground">氏名</TableCell>
            <TableCell className="break-words font-bold">{item.fullName}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="w-36 bg-muted/40 font-bold text-muted-foreground">
              ニックネーム
            </TableCell>
            <TableCell className="break-words font-bold">{item.nickname}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="bg-muted/40 font-bold text-muted-foreground">学年</TableCell>
            <TableCell className="font-bold">{item.grade}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="bg-muted/40 font-bold text-muted-foreground">
              事前登録日
            </TableCell>
            <TableCell className="font-bold">{formatJapaneseDate(item.registeredAt)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ParticipantStatusChip({ item }: { item: PreRegisteredParticipant }) {
  return (
    <div className="flex max-w-full items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
      <Badge variant="secondary" style={{ height: 'auto' }} className="px-2 py-0.5 text-xs">
        とうろくするひと
      </Badge>
      <span className="min-w-0 truncate">{item.nickname}</span>
      <Badge variant="secondary" style={{ height: 'auto' }} className="px-2 py-0.5 text-xs">
        {item.grade}
      </Badge>
    </div>
  );
}

function LoadingScreen() {
  return (
    <PageShell className="p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <Card className="flex flex-1 border-sky-200 py-4 shadow-sm">
          <CardContent className="grid flex-1 grid-rows-1 gap-5 p-6 md:grid-cols-[320px_minmax(0,1fr)] md:gap-8">
            <Skeleton className="h-full min-h-56 w-full rounded-3xl" />
            <Skeleton className="h-full min-h-56 w-full rounded-3xl" />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ActivatingScreen({ item }: { item: PreRegisteredParticipant }) {
  return (
    <PageShell className="items-center justify-center">
      <Card className="w-full max-w-xl border-emerald-200 shadow-sm">
        <PanelHeader
          icon={<IconRefresh className="size-8 animate-spin" />}
          title="登録しています"
          tone="emerald"
        />
        <CardContent className="flex flex-col gap-5">
          <ParticipantDetails item={item} />
          <p className="text-center text-lg font-bold text-foreground">
            IDを発行して、今日のチェックインを記録しています。
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function GuidelineSlideView({
  item,
  slide,
  current,
  total,
  isLast,
  agreed,
  direction,
  onAgreeChange,
  onPrev,
  onNext,
  onSubmit,
}: {
  item: PreRegisteredParticipant;
  slide: GuidelineSlide;
  current: number;
  total: number;
  isLast: boolean;
  agreed: boolean;
  direction: number;
  onAgreeChange: (checked: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const tone = guidelineToneClasses[slide.tone];
  const prefersReduced = useReducedMotion();
  const offset = 48;

  // 矢印キーでスライドを前後に移動できるようにする（iPad の外付けキーボード運用を想定）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !isLast) onNext();
      if (e.key === 'ArrowLeft' && current > 1) onPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, isLast, onNext, onPrev]);

  return (
    <PageShell className="p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <Card className="flex flex-1 border-sky-200 py-4 shadow-sm">
          <PanelHeader
            icon={<IconBook className="size-8" />}
            title="参加ガイドライン"
            tone="sky"
            trailing={<ParticipantStatusChip item={item} />}
          />
          <CardContent className="flex flex-1 flex-col gap-5 pt-2 sm:pt-3">
            {/* 進捗: セクションの切れ目で間隔を空けたピップ。文字を増やさず全体の位置を伝える。 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className={cn('rounded-full px-3.5 py-1.5 text-sm font-bold', tone.chip)}>
                  {slide.section}
                </span>
                <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                  {current} / {total}
                </span>
              </div>
              <div className="flex items-center">
                {GUIDELINE_SLIDES.map((s, i) => {
                  const newSection = i > 0 && s.section !== GUIDELINE_SLIDES[i - 1].section;
                  const isActive = i === current - 1;
                  const isDone = i < current - 1;
                  return (
                    <span
                      key={`${s.section}-${s.label}`}
                      aria-hidden="true"
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        i === 0 ? '' : 'ml-1.5',
                        newSection && 'ml-4',
                        isActive
                          ? cn('w-8', tone.bar)
                          : isDone
                            ? 'w-2 bg-slate-400'
                            : 'w-2 bg-slate-200',
                      )}
                    />
                  );
                })}
              </div>
            </div>

            {/* ヒーロー: 左「アイコン＋タイトル」カード / 右「本文」カードを枠内いっぱいに伸ばす。
                カードはテキストと同じ section の slide+fade で一緒に登場する（個別 pop はしない）。 */}
            <div className="relative flex flex-1 overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.section
                  key={current}
                  custom={direction}
                  initial={prefersReduced ? false : { opacity: 0, x: direction * offset }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: direction * -offset }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
                  className="grid w-full grid-rows-1 gap-5 px-1 sm:px-2 md:grid-cols-[320px_minmax(0,1fr)] md:gap-8"
                >
                  <div
                    className={cn(
                      'flex h-full flex-col items-center justify-center gap-6 rounded-3xl border p-8 text-center shadow-sm',
                      tone.card,
                    )}
                  >
                    <div
                      aria-hidden="true"
                      className={cn(
                        'flex size-28 items-center justify-center rounded-full',
                        tone.iconCircle,
                      )}
                    >
                      {slide.icon}
                    </div>
                    <span className={cn('text-xl font-bold tracking-wide', tone.kicker)}>
                      {slide.label}
                    </span>
                  </div>

                  <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center shadow-sm md:p-10">
                    <p className="text-balance text-2xl font-bold leading-relaxed text-slate-900 sm:text-3xl sm:leading-relaxed">
                      {slide.rule}
                    </p>
                  </div>
                </motion.section>
              </AnimatePresence>
            </div>

            {isLast ? (
              <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="guideline-agreement"
                    checked={agreed}
                    onCheckedChange={(checked) => onAgreeChange(checked === true)}
                    className="mt-0.5 size-5 rounded-md bg-white"
                  />
                  <label
                    htmlFor="guideline-agreement"
                    className="text-base font-semibold text-emerald-950"
                  >
                    参加者本人と保護者に説明し、内容を確認しました。
                  </label>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={current === 1}
                onClick={onPrev}
                className="h-16 text-xl"
              >
                <IconChevronLeft className="size-7" data-icon="inline-start" />
                前へ
              </Button>
              <Button asChild variant="outline" size="lg" className="h-16 text-xl">
                <Link href="/first-time">
                  <IconArrowLeft className="size-6" data-icon="inline-start" />
                  選び直す
                </Link>
              </Button>
              {isLast ? (
                <Button
                  type="button"
                  size="lg"
                  disabled={!agreed}
                  onClick={onSubmit}
                  className="h-16 text-xl"
                >
                  <IconCheck className="size-7" data-icon="inline-start" />
                  同意してID発行
                </Button>
              ) : (
                <Button type="button" size="lg" onClick={onNext} className="h-16 text-xl">
                  次へ
                  <IconChevronRight className="size-7" data-icon="inline-end" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function GuidelinePageContent() {
  const searchParams = useSearchParams();
  const preRegistrationId = searchParams.get('preRegistrationId') ?? '';
  const [mutation, setMutation] = useState<MutationState>({ kind: 'idle' });
  const [slideIndex, setSlideIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [direction, setDirection] = useState(1);

  const { state, reload } = useApiResource<PreRegisteredListResponse>('/checkin/pre-registered', {
    enabled: !!preRegistrationId,
  });

  const item = useMemo(
    () =>
      state.kind === 'ok'
        ? (state.data.participants.find(
            (participant) => participant.preRegistrationId === preRegistrationId,
          ) ?? null)
        : null,
    [state, preRegistrationId],
  );

  const goPrev = () => {
    setDirection(-1);
    setSlideIndex((index) => Math.max(0, index - 1));
  };
  const goNext = () => {
    setDirection(1);
    setSlideIndex((index) => Math.min(GUIDELINE_SLIDES.length - 1, index + 1));
  };

  const activate = async () => {
    if (!item) return;
    setMutation({ kind: 'activating', item });
    try {
      const r = await apiFetch('/checkin/activate', {
        method: 'POST',
        body: { preRegistrationId: item.preRegistrationId },
      });
      const body = (await r.json()) as ActivateResponse | { error: string; message: string };
      if (!r.ok) {
        const msg = 'message' in body ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setMutation({
        kind: 'result',
        data: body as ActivateResponse,
        registeredAt: item.registeredAt,
      });
    } catch (e) {
      setMutation({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        item,
      });
    }
  };

  const slide = useMemo(() => GUIDELINE_SLIDES[slideIndex], [slideIndex]);

  // ページ固有のエラー画面ボタン。選び直す（/first-time）＋ 再読み込み（一覧再取得）。
  const retryActions = (
    <>
      <Button asChild size="lg" className="h-16 text-xl">
        <Link href="/first-time">
          <IconArrowLeft className="size-6" data-icon="inline-start" />
          選び直す
        </Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={() => reload()}
        className="h-16 text-xl"
      >
        <IconRefresh className="size-6" data-icon="inline-start" />
        再読み込み
      </Button>
    </>
  );

  if (mutation.kind === 'activating') {
    return <ActivatingScreen item={mutation.item} />;
  }

  if (mutation.kind === 'result') {
    return (
      <ResultSummaryCard
        title="登録できました"
        tone="emerald"
        icon={<IconCircleCheck className="size-8" />}
        rows={[
          {
            label: 'ID',
            value: mutation.data.participantId,
            valueClassName: 'tabular-nums',
          },
          { label: '氏名', value: mutation.data.fullName },
          { label: 'ニックネーム', value: mutation.data.nickname },
          { label: '学年', value: mutation.data.grade },
          {
            label: '初回チェックイン',
            value: formatJapaneseDateTime(mutation.data.checkedInAt),
          },
          {
            label: '事前登録日',
            value: formatJapaneseDate(mutation.registeredAt),
          },
        ]}
        note="表示されたIDでカードを作ってください"
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

  if (mutation.kind === 'error') {
    return (
      <CheckinErrorScreen
        title="登録できませんでした"
        message={mutation.message}
        footer={
          <div className="w-full max-w-xl text-left">
            <ParticipantDetails item={mutation.item} />
          </div>
        }
        actions={retryActions}
      />
    );
  }

  if (!preRegistrationId) {
    return (
      <CheckinErrorScreen
        title="ガイドラインを表示できません"
        message="登録する人を選んでください。"
        actions={
          <>
            <Button asChild size="lg" className="h-16 text-xl">
              <Link href="/first-time">
                <IconArrowLeft className="size-6" data-icon="inline-start" />
                選び直す
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
              <Link href="/">
                <IconHome className="size-6" data-icon="inline-start" />
                ホームに戻る
              </Link>
            </Button>
          </>
        }
      />
    );
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return <LoadingScreen />;
  }

  if (state.kind === 'error') {
    return (
      <CheckinErrorScreen
        title="ガイドラインを表示できません"
        message={state.message}
        actions={retryActions}
      />
    );
  }

  if (!item) {
    return (
      <CheckinErrorScreen
        title="ガイドラインを表示できません"
        message="この事前登録はすでに登録済み、または一覧にありません。"
        actions={retryActions}
      />
    );
  }

  if (!slide) {
    return (
      <CheckinErrorScreen
        title="ガイドラインを表示できません"
        message="ガイドラインを表示できません。"
        actions={retryActions}
      />
    );
  }

  return (
    <GuidelineSlideView
      item={item}
      slide={slide}
      current={slideIndex + 1}
      total={GUIDELINE_SLIDES.length}
      isLast={slideIndex === GUIDELINE_SLIDES.length - 1}
      agreed={agreed}
      direction={direction}
      onAgreeChange={setAgreed}
      onPrev={goPrev}
      onNext={goNext}
      onSubmit={() => void activate()}
    />
  );
}

export default function GuidelinePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <GuidelinePageContent />
    </Suspense>
  );
}
