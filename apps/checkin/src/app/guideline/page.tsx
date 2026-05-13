'use client';

import {
  IconAlertCircle,
  IconArrowLeft,
  IconBook,
  IconBottle,
  IconCameraOff,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconClipboardCheck,
  IconClock,
  IconCloudDownload,
  IconDoorExit,
  IconFirstAidKit,
  IconHandStop,
  IconHeartHandshake,
  IconHome,
  IconHomeQuestion,
  IconIdBadge,
  IconMessageCircleX,
  IconMessages,
  IconParkingOff,
  IconRefresh,
  IconShieldCheck,
  IconTools,
  IconUsersGroup,
} from '@tabler/icons-react';
import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
} from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent } from '@tecnova/ui/components/card';
import { Checkbox } from '@tecnova/ui/components/checkbox';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@tecnova/ui/components/table';
import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';
import { cn } from '@tecnova/ui/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { ResultSummaryCard } from '@/components/result-summary-card';
import { formatJapaneseDate, formatJapaneseDateTime } from '@/lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; item: PreRegisteredParticipant }
  | { kind: 'activating'; item: PreRegisteredParticipant }
  | { kind: 'result'; data: ActivateResponse; registeredAt: string }
  | { kind: 'error'; message: string; item?: PreRegisteredParticipant };

type GuidelineTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';

type GuidelineSlide = {
  section: string;
  group: string;
  number: number;
  title: string;
  rule: string;
  explanation: string;
  visual: string;
  tone: GuidelineTone;
  icon: ReactNode;
};

const guidelineToneClasses: Record<
  GuidelineTone,
  { badge: string; panel: string; icon: string; progress: string }
> = {
  emerald: {
    badge: 'bg-emerald-100 text-emerald-700',
    panel: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    icon: 'bg-emerald-100 text-emerald-700',
    progress: 'bg-emerald-500',
  },
  sky: {
    badge: 'bg-sky-100 text-sky-700',
    panel: 'border-sky-200 bg-sky-50 text-sky-950',
    icon: 'bg-sky-100 text-sky-700',
    progress: 'bg-sky-500',
  },
  amber: {
    badge: 'bg-amber-100 text-amber-700',
    panel: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: 'bg-amber-100 text-amber-700',
    progress: 'bg-amber-500',
  },
  rose: {
    badge: 'bg-rose-100 text-rose-700',
    panel: 'border-rose-200 bg-rose-50 text-rose-950',
    icon: 'bg-rose-100 text-rose-700',
    progress: 'bg-rose-500',
  },
  slate: {
    badge: 'bg-slate-100 text-slate-700',
    panel: 'border-slate-200 bg-slate-50 text-slate-950',
    icon: 'bg-slate-100 text-slate-700',
    progress: 'bg-slate-500',
  },
};

const GUIDELINE_SLIDES: GuidelineSlide[] = [
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 1,
    title: '機材はゆずり合って使う',
    rule: '機材はゆずり合って大切に使い、使ったものは元の場所に片付けましょう。',
    explanation:
      '使いたい人が待っているかもしれません。使い終わったら、次の人がすぐ使える状態に戻します。',
    visual: '使う、戻す、次の人へ。',
    tone: 'emerald',
    icon: <IconTools className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 2,
    title: '作品と人を大切にする',
    rule: '他の人の作るものを大切にして、お互いのことを尊重しましょう。',
    explanation:
      '作品はその人のアイデアです。触る前に聞いて、よいところを見つける姿勢で関わります。',
    visual: '作品にも、人にも、ていねいに。',
    tone: 'emerald',
    icon: <IconHeartHandshake className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 3,
    title: '作業をじゃましない',
    rule: '他の人の作業をじゃましたり、ばかにしたりしないようにしましょう。',
    explanation:
      '集中している人の手元や画面に急に触らない。うまくいかない時も、からかわずに見守ります。',
    visual: '集中している人には、少し距離をとる。',
    tone: 'amber',
    icon: <IconHandStop className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 4,
    title: '傷つける言葉を使わない',
    rule: '人を傷つける、差別する、怒らせるようなことはやめましょう。',
    explanation:
      '言葉や態度で相手が嫌な気持ちになることがあります。迷ったら、言う前にスタッフへ相談します。',
    visual: 'その言葉で相手が安心できるか考える。',
    tone: 'rose',
    icon: <IconShieldCheck className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 5,
    title: 'ケンカになったら大人へ',
    rule: 'ケンカはやめましょう。自分たちで解決できない問題が起こったら、大人に相談しましょう。',
    explanation:
      '困ったことを無理に自分たちだけで解決しなくて大丈夫です。近くのスタッフに状況を伝えます。',
    visual: 'こまったら、止まって、話して、相談。',
    tone: 'sky',
    icon: <IconMessages className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 6,
    title: 'ダウンロード前に聞く',
    rule: '何かをダウンロードまたはアップロードするときは、かならずスタッフに聞きましょう。',
    explanation:
      'ネット上のファイルには危険なものや公開してはいけないものがあります。操作する前に確認します。',
    visual: '保存する前、送る前にスタッフ確認。',
    tone: 'sky',
    icon: <IconCloudDownload className="size-16" />,
  },
  {
    section: '参加にあたって',
    group: 'テクノバの決まりごと',
    number: 7,
    title: '安全に機材を使う',
    rule: 'ケガにつながる機材もあるので、スタッフの注意を聞いて安全に使いましょう。',
    explanation:
      '熱い、動く、切れる機材があります。スタッフの説明を聞いてから、決められた使い方を守ります。',
    visual: '説明を聞く、確認する、ゆっくり使う。',
    tone: 'amber',
    icon: <IconFirstAidKit className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '利用の流れ',
    number: 1,
    title: '利用者カードを持ってくる',
    rule: '初回利用時に利用者カードをお渡しします。無くさないようにして、利用時は必ず持って来てください。',
    explanation: 'カードは受付のための大切なものです。なくした時は、受付でスタッフに伝えます。',
    visual: 'カードはテクノバに来る時の持ちもの。',
    tone: 'emerald',
    icon: <IconIdBadge className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '利用の流れ',
    number: 2,
    title: '受付して名札をつける',
    rule: '利用する際は受付をして、名札を着用してください。',
    explanation: '受付で今日来ていることが分かるようにします。名札はスタッフが声をかける目印です。',
    visual: '来たら受付、活動中は名札。',
    tone: 'sky',
    icon: <IconClipboardCheck className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '利用の流れ',
    number: 3,
    title: '帰る前に報告する',
    rule: '帰る際はアンケートに回答して、スタッフに報告をし、名札ケースを置いて帰ってください。',
    explanation:
      '帰る時はチェックアウトの合図が必要です。アンケートと名札ケースまで終わったら帰れます。',
    visual: 'アンケート、報告、名札ケース。',
    tone: 'emerald',
    icon: <IconDoorExit className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '安全な帰り方',
    number: 4,
    title: '遅い時間は迎えに来てもらう',
    rule: '遅い時間帯（小学生の場合は18時以降）に参加する際は、迎えに来てもらってください。',
    explanation: '暗い時間の帰り道は危険が増えます。小学生は18時以降、保護者の迎えを確認します。',
    visual: '18時以降の小学生は、お迎え確認。',
    tone: 'amber',
    icon: <IconClock className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '安全な過ごし方',
    number: 5,
    title: '建物から出る時は報告する',
    rule: 'トイレ以外で途中退室する（建物から出る）際はスタッフに報告してください（名札は置いていく）。',
    explanation:
      'スタッフが今どこにいるか分かるようにします。外へ出る時は、名札を置いてから伝えます。',
    visual: '建物を出る前に、スタッフへ一声。',
    tone: 'sky',
    icon: <IconHomeQuestion className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '連絡先とSNS',
    number: 6,
    title: '連絡先を交換しない',
    rule: 'トラブル防止のため、スタッフと利用者のSNS等連絡先の交換を禁止します。',
    explanation: 'スタッフとはテクノバの中で話します。個人のSNSや連絡先は交換しません。',
    visual: 'SNS交換はしない。',
    tone: 'rose',
    icon: <IconMessageCircleX className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '連絡先とSNS',
    number: 7,
    title: '人や作品を勝手に投稿しない',
    rule: 'SNSで他の人の姿や作品などを投稿しないでください。',
    explanation:
      '写真や作品には本人の大切な情報が含まれます。投稿したい時は、必ずスタッフに相談します。',
    visual: '撮る前、載せる前に確認。',
    tone: 'rose',
    icon: <IconCameraOff className="size-16" />,
  },
  {
    section: '守ってほしいこと',
    group: '体調管理',
    number: 8,
    title: '飲み物を持ってくる',
    rule: '熱中症対策のために、飲み物を持参しましょう。',
    explanation:
      '活動に集中すると水分を忘れやすくなります。自分の飲み物を持って、こまめに飲みます。',
    visual: '作る時間にも、水分補給。',
    tone: 'sky',
    icon: <IconBottle className="size-16" />,
  },
  {
    section: '保護者の方へ',
    group: '送迎等',
    number: 1,
    title: '遅い時間は保護者の送迎',
    rule: '遅い時間帯（小学生の場合は18時以降）に参加される際は、保護者が責任を持って送り迎えいただきますようお願いします。',
    explanation: '安全な帰宅のため、時間帯に応じて送迎の準備をお願いします。',
    visual: '帰り方まで決めてから参加。',
    tone: 'amber',
    icon: <IconUsersGroup className="size-16" />,
  },
  {
    section: '保護者の方へ',
    group: '送迎等',
    number: 2,
    title: '専用駐車場はありません',
    rule: '専用の駐車場はありませんので、ご注意ください。',
    explanation: '送迎時は周辺の交通や施設利用者の迷惑にならないようご注意ください。',
    visual: '車で来る時は停める場所に注意。',
    tone: 'slate',
    icon: <IconParkingOff className="size-16" />,
  },
  {
    section: '保護者の方へ',
    group: 'その他',
    number: 1,
    title: 'SNS連絡先の交換は禁止',
    rule: 'トラブル防止のため、スタッフと利用者のSNS等連絡先の交換は禁止させていただきます。',
    explanation: '安全な運営のため、個人間の連絡先交換は行いません。',
    visual: '連絡はテクノバの場を通して。',
    tone: 'rose',
    icon: <IconMessageCircleX className="size-16" />,
  },
  {
    section: '保護者の方へ',
    group: 'その他',
    number: 2,
    title: 'アンケートへのご協力',
    rule: '保護者向けアンケートの実施を検討していますので、ご協力をお願いします。',
    explanation: '活動をよりよくするために、保護者の方の意見を参考にします。',
    visual: '声を集めて、次の改善へ。',
    tone: 'emerald',
    icon: <IconClipboardCheck className="size-16" />,
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
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <Card className="border-sky-200 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-6">
            <Skeleton className="h-14 w-72" />
            <Skeleton className="h-4 w-full" />
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Skeleton className="h-80 rounded-lg" />
              <Skeleton className="h-80 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ErrorScreen({
  title = 'ガイドラインを表示できません',
  message,
  item,
  onRetry,
}: {
  title?: string;
  message: string;
  item?: PreRegisteredParticipant;
  onRetry?: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {item ? (
        <div className="w-full max-w-xl text-left">
          <ParticipantDetails item={item} />
        </div>
      ) : null}
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-16 text-xl">
          <Link href="/first-time">
            <IconArrowLeft className="size-6" data-icon="inline-start" />
            選び直す
          </Link>
        </Button>
        {onRetry ? (
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
        ) : (
          <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
            <Link href="/">
              <IconHome className="size-6" data-icon="inline-start" />
              ホームに戻る
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}

function ActivatingScreen({ item }: { item: PreRegisteredParticipant }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-sky-50 p-4 sm:p-6">
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
    </main>
  );
}

function GuidelineSlideView({
  item,
  slide,
  current,
  total,
  isLast,
  agreed,
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
  onAgreeChange: (checked: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const tone = guidelineToneClasses[slide.tone];
  const progress = `${(current / total) * 100}%`;

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
        <Card className="flex flex-1 border-sky-200 py-4 shadow-sm">
          <PanelHeader
            icon={<IconBook className="size-8" />}
            title="参加ガイドライン"
            tone="sky"
            trailing={<ParticipantStatusChip item={item} />}
          />
          <CardContent className="flex flex-1 flex-col justify-start gap-4 pt-2 sm:pt-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  style={{ height: 'auto' }}
                  className={cn('px-3 py-1.5 text-sm', tone.badge)}
                >
                  {slide.section}
                </Badge>
                <Badge
                  variant="secondary"
                  style={{ height: 'auto' }}
                  className="px-3 py-1.5 text-sm"
                >
                  {slide.group} {slide.number}
                </Badge>
                <span className="ml-auto text-sm font-semibold text-muted-foreground tabular-nums">
                  {current} / {total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                <div
                  className={cn('h-full rounded-full', tone.progress)}
                  style={{ width: progress }}
                />
              </div>
            </div>

            <section className="grid min-h-[300px] items-stretch gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-4 rounded-lg border p-4 text-center',
                  tone.panel,
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn('flex size-24 items-center justify-center rounded-full', tone.icon)}
                >
                  {slide.icon}
                </div>
                <p className="text-2xl font-semibold leading-tight">{slide.visual}</p>
              </div>

              <div className="flex flex-col justify-center rounded-lg border bg-white p-4 sm:p-5">
                <p className="text-base font-semibold text-muted-foreground">{slide.group}</p>
                <h1 className="mt-2 break-words text-3xl font-bold leading-tight sm:text-4xl">
                  {slide.title}
                </h1>
                <p className="mt-4 rounded-lg border bg-slate-50 p-4 text-xl font-semibold leading-relaxed">
                  {slide.rule}
                </p>
                <p className="mt-3 text-lg font-medium leading-relaxed text-foreground">
                  {slide.explanation}
                </p>
              </div>
            </section>

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
    </main>
  );
}

function GuidelinePageContent() {
  const searchParams = useSearchParams();
  const preRegistrationId = searchParams.get('preRegistrationId') ?? '';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [slideIndex, setSlideIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);

  const loadTarget = useCallback(async () => {
    if (!preRegistrationId) {
      setState({ kind: 'error', message: '登録する人を選んでください。' });
      return;
    }

    setState({ kind: 'loading' });
    setSlideIndex(0);
    setAgreed(false);
    try {
      const r = await apiFetch('/checkin/pre-registered');
      if (!r.ok) throw new Error(await readErrorMessage(r));
      const data = (await r.json()) as PreRegisteredListResponse;
      const item = data.participants.find(
        (participant) => participant.preRegistrationId === preRegistrationId,
      );
      if (!item) {
        throw new Error('この事前登録はすでに登録済み、または一覧にありません。');
      }
      setState({ kind: 'ready', item });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [preRegistrationId]);

  useEffect(() => {
    void loadTarget();
  }, [loadTarget]);

  const activate = async () => {
    if (state.kind !== 'ready') return;
    const { item } = state;
    setState({ kind: 'activating', item });
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
      setState({
        kind: 'result',
        data: body as ActivateResponse,
        registeredAt: item.registeredAt,
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        item,
      });
    }
  };

  const slide = useMemo(() => GUIDELINE_SLIDES[slideIndex], [slideIndex]);

  if (state.kind === 'loading') {
    return <LoadingScreen />;
  }

  if (state.kind === 'error') {
    return (
      <ErrorScreen
        title={state.item ? '登録できませんでした' : undefined}
        message={state.message}
        item={state.item}
        onRetry={() => void loadTarget()}
      />
    );
  }

  if (state.kind === 'activating') {
    return <ActivatingScreen item={state.item} />;
  }

  if (state.kind === 'result') {
    return (
      <ResultSummaryCard
        title="登録できました"
        tone="emerald"
        icon={<IconCircleCheck className="size-8" />}
        rows={[
          {
            label: 'ID',
            value: state.data.participantId,
            valueClassName: 'tabular-nums',
          },
          { label: '氏名', value: state.data.fullName },
          { label: 'ニックネーム', value: state.data.nickname },
          { label: '学年', value: state.data.grade },
          {
            label: '初回チェックイン',
            value: formatJapaneseDateTime(state.data.checkedInAt),
          },
          {
            label: '事前登録日',
            value: formatJapaneseDate(state.registeredAt),
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

  if (!slide) {
    return (
      <ErrorScreen message="ガイドラインを表示できません。" onRetry={() => void loadTarget()} />
    );
  }

  return (
    <GuidelineSlideView
      item={state.item}
      slide={slide}
      current={slideIndex + 1}
      total={GUIDELINE_SLIDES.length}
      isLast={slideIndex === GUIDELINE_SLIDES.length - 1}
      agreed={agreed}
      onAgreeChange={setAgreed}
      onPrev={() => setSlideIndex((index) => Math.max(0, index - 1))}
      onNext={() => setSlideIndex((index) => Math.min(GUIDELINE_SLIDES.length - 1, index + 1))}
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
