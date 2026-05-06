'use client';

import {
  IconAlertCircle,
  IconArrowRight,
  IconCalendar,
  IconCircleCheck,
  IconHome,
  IconRefresh,
  IconSearch,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
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
import { Card, CardContent, CardDescription, CardHeader } from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@tecnova/ui/components/table';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '@/components/panel-header';
import { ResultSummaryCard } from '@/components/result-summary-card';
import { apiFetch, readErrorMessage } from '@/lib/api';
import { formatJapaneseDate, formatJapaneseDateTime } from '@/lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'list'; items: PreRegisteredParticipant[] }
  | { kind: 'activating'; item: PreRegisteredParticipant }
  | { kind: 'result'; data: ActivateResponse; registeredAt: string }
  | { kind: 'error'; message: string; item?: PreRegisteredParticipant };

function ParticipantDetails({ item }: { item: PreRegisteredParticipant }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableBody className="text-base sm:text-lg">
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

function RegistrationSteps() {
  const steps = [
    { number: '1', title: '名前をさがす', description: 'ニックネームと学年で確認' },
    { number: '2', title: '登録前に確認', description: '本人だけを選んでID発行へ' },
    { number: '3', title: 'カード作成', description: '表示されたIDを使う' },
  ];

  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((step) => (
        <li key={step.number} className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-black text-emerald-700 tabular-nums">
            {step.number}
          </span>
          <span className="min-w-0">
            <span className="block text-base font-black">{step.title}</span>
            <span className="block text-sm font-bold text-muted-foreground">
              {step.description}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function FirstTimePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');

  const loadParticipants = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await apiFetch('/checkin/pre-registered');
      if (!r.ok) throw new Error(await readErrorMessage(r));
      const data = (await r.json()) as PreRegisteredListResponse;
      setState({ kind: 'list', items: data.participants });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  const activate = async (item: PreRegisteredParticipant) => {
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
      setState({ kind: 'result', data: body as ActivateResponse, registeredAt: item.registeredAt });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        item,
      });
    }
  };

  const filteredItems = useMemo(() => {
    if (state.kind !== 'list') return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return state.items;
    return state.items.filter((item) => {
      const values = [
        item.nickname,
        item.grade,
        item.registeredAt,
        formatJapaneseDate(item.registeredAt),
      ];
      return values.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, state]);

  if (state.kind === 'loading') {
    return (
      <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
          <Card className="border-sky-200 shadow-sm">
            <CardHeader className="gap-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-7 w-80" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (state.kind === 'activating') {
    return (
      <main className="flex flex-1 items-center justify-center bg-sky-50 p-4 sm:p-6">
        <Card className="w-full max-w-xl border-emerald-200 shadow-sm">
          <PanelHeader
            icon={<IconRefresh className="size-8 animate-spin" />}
            title="登録しています"
            tone="emerald"
          />
          <CardContent className="flex flex-col gap-5">
            <ParticipantDetails item={state.item} />
            <p className="text-center text-lg font-bold text-foreground">
              IDを発行して、今日のチェックインを記録しています。
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
        <Alert variant="destructive" className="max-w-xl text-left text-lg">
          <IconAlertCircle className="size-6" aria-hidden="true" />
          <AlertTitle>{state.item ? '登録できませんでした' : '一覧を表示できません'}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        {state.item ? (
          <div className="w-full max-w-xl text-left">
            <ParticipantDetails item={state.item} />
          </div>
        ) : null}
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            size="lg"
            onClick={() => void loadParticipants()}
            className="h-16 text-xl"
          >
            <IconRefresh className="size-6" data-icon="inline-start" />
            {state.item ? '一覧を更新' : '再読み込み'}
          </Button>
          <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
            <Link href="/">
              <IconHome className="size-6" data-icon="inline-start" />
              ホームに戻る
            </Link>
          </Button>
        </div>
      </main>
    );
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
          { label: 'ニックネーム', value: state.data.nickname },
          { label: '学年', value: state.data.grade },
          { label: '初回チェックイン', value: formatJapaneseDateTime(state.data.checkedInAt) },
          { label: '事前登録日', value: formatJapaneseDate(state.registeredAt) },
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

  return (
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <Card className="border-sky-200 shadow-sm">
          <PanelHeader icon={<IconUserPlus className="size-8" />} title="初回登録" tone="emerald" />
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <CardDescription className="text-lg text-foreground">
                IDカードをまだ持っていない人を、事前登録の一覧から選んでください。
              </CardDescription>
              <Badge
                variant="secondary"
                style={{ height: 'auto' }}
                className="w-fit px-4 py-2 text-base"
              >
                未登録 {state.items.length}人
              </Badge>
            </div>

            <RegistrationSteps />

            {state.items.length === 0 ? (
              <Alert className="border-sky-200 bg-white">
                <IconAlertCircle className="size-5" aria-hidden="true" />
                <AlertTitle>今、登録できる人はいません</AlertTitle>
                <AlertDescription>
                  名前が見つからないときはスタッフに声をかけてください。
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="relative">
                    <IconSearch
                      className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      aria-label="事前登録者検索"
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="ニックネーム・学年・登録日で検索"
                      className="h-14 rounded-lg bg-white pr-5 pl-12 text-lg"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:flex">
                    {query ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => setQuery('')}
                        className="h-14 text-lg"
                      >
                        <IconX className="size-6" data-icon="inline-start" />
                        検索をクリア
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => void loadParticipants()}
                      className="h-14 text-lg"
                    >
                      <IconRefresh className="size-6" data-icon="inline-start" />
                      更新
                    </Button>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                    <IconAlertCircle className="size-5" aria-hidden="true" />
                    <AlertTitle>一致する人がいません</AlertTitle>
                    <AlertDescription>
                      検索を消して、一覧からニックネームと学年を確認してください。
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {filteredItems.map((item) => (
                      <li key={item.preRegistrationId}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-auto min-h-28 w-full justify-between gap-4 whitespace-normal rounded-lg border-2 bg-white px-5 py-4 text-left hover:bg-emerald-50"
                            >
                              <span className="flex min-w-0 flex-col gap-2">
                                <span className="break-words text-2xl font-black leading-tight">
                                  {item.nickname}
                                </span>
                                <span className="flex items-center gap-2 text-base text-muted-foreground">
                                  <IconCalendar className="size-5 shrink-0" aria-hidden="true" />
                                  事前登録 {formatJapaneseDate(item.registeredAt)}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  style={{ height: 'auto' }}
                                  className="px-4 py-2 text-base"
                                >
                                  {item.grade}
                                </Badge>
                                <IconArrowRight
                                  className="size-6 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogMedia className="bg-emerald-100 text-emerald-700">
                                <IconUserPlus className="size-9" aria-hidden="true" />
                              </AlertDialogMedia>
                              <AlertDialogTitle>{item.nickname}さんを登録しますか</AlertDialogTitle>
                              <AlertDialogDescription>
                                登録するとIDが発行され、今日のチェックインも記録されます。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <ParticipantDetails item={item} />
                            <AlertDialogFooter>
                              <AlertDialogCancel size="lg">キャンセル</AlertDialogCancel>
                              <AlertDialogAction size="lg" onClick={() => void activate(item)}>
                                IDを発行する
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
