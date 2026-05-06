'use client';

import {
  IconAlertCircle,
  IconArrowBack,
  IconCalendar,
  IconCircleCheck,
  IconRefresh,
  IconUserPlus,
} from '@tabler/icons-react';
import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
} from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
import { Separator } from '@tecnova/ui/components/separator';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ResultSummaryCard } from '@/components/result-summary-card';
import { apiFetch, readErrorMessage } from '@/lib/api';
import { formatJapaneseDate } from '@/lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'list'; items: PreRegisteredParticipant[] }
  | { kind: 'activating' }
  | { kind: 'result'; data: ActivateResponse; registeredAt: string }
  | { kind: 'error'; message: string };

export default function FirstTimePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

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
    setState({ kind: 'activating' });
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
      });
    }
  };

  if (state.kind === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center bg-sky-50 p-6">
        <Card className="w-full max-w-xl border-sky-200 shadow-sm">
          <CardHeader>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (state.kind === 'activating') {
    return (
      <main className="flex flex-1 items-center justify-center bg-emerald-50 p-6">
        <Card className="w-full max-w-md border-emerald-200 text-center shadow-sm">
          <CardHeader className="items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
              <Skeleton className="h-14 w-14 rounded-full" />
            </div>
            <CardTitle className="text-3xl">登録しています</CardTitle>
            <CardDescription className="text-lg">そのまま少し待ってね</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
        <Alert variant="destructive" className="max-w-xl text-left text-lg">
          <IconAlertCircle className="size-6" aria-hidden="true" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            size="lg"
            onClick={() => void loadParticipants()}
            className="h-16 text-xl"
          >
            <IconRefresh className="size-6" data-icon="inline-start" />
            もう一度
          </Button>
          <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
            <Link href="/">
              <IconArrowBack className="size-6" data-icon="inline-start" />
              トップへ戻る
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
          { label: '事前登録日', value: formatJapaneseDate(state.registeredAt) },
        ]}
        note="スタッフといっしょにカードを作ってね"
        footer={
          <Button asChild size="lg" className="h-16 w-full text-xl">
            <Link href="/">
              <IconArrowBack className="size-6" data-icon="inline-start" />
              トップへ戻る
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
          <CardHeader className="gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <IconUserPlus className="size-7" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl">まだ ID カードを持っていない人</CardTitle>
            </div>
            <CardDescription className="text-lg">
              見つけた名前を大きくタップすると、今日から使う ID が出ます。
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            {state.items.length === 0 ? (
              <Alert className="border-sky-200 bg-white">
                <IconAlertCircle className="size-5" aria-hidden="true" />
                <AlertTitle>今、登録できる人はいません</AlertTitle>
                <AlertDescription>
                  名前が見つからないときはスタッフに声をかけてください。
                </AlertDescription>
              </Alert>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {state.items.map((item) => (
                  <li key={item.preRegistrationId}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => activate(item)}
                      className="h-auto min-h-28 w-full justify-between gap-4 whitespace-normal rounded-lg border-2 bg-white px-5 py-4 text-left hover:bg-sky-50"
                    >
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="truncate text-2xl font-black">{item.nickname}</span>
                        <span className="flex items-center gap-2 text-base text-muted-foreground">
                          <IconCalendar className="size-5 shrink-0" aria-hidden="true" />
                          事前登録 {formatJapaneseDate(item.registeredAt)}
                        </span>
                      </span>
                      <span className="shrink-0">
                        <Badge
                          variant="secondary"
                          style={{ height: 'auto' }}
                          className="px-4 py-2 text-base"
                        >
                          {item.grade}
                        </Badge>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
