'use client';

import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
} from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

type State =
  | { kind: 'loading' }
  | { kind: 'list'; items: PreRegisteredParticipant[] }
  | { kind: 'activating' }
  | { kind: 'result'; data: ActivateResponse }
  | { kind: 'error'; message: string };

export default function FirstTimePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${API_URL}/checkin/pre-registered`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as PreRegisteredListResponse;
        setState({ kind: 'list', items: data.participants });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, []);

  const activate = async (preRegistrationId: string) => {
    setState({ kind: 'activating' });
    try {
      const r = await fetch(`${API_URL}/checkin/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preRegistrationId }),
      });
      const body = (await r.json()) as ActivateResponse | { error: string; message: string };
      if (!r.ok) {
        const msg = 'message' in body ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setState({ kind: 'result', data: body as ActivateResponse });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (state.kind === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-32" />
      </main>
    );
  }

  if (state.kind === 'activating') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Skeleton className="h-8 w-32" />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (state.kind === 'result') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-4xl">{state.data.nickname}さん、ようこそ！</CardTitle>
            <CardDescription className="text-lg">あなたのIDは</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-7xl font-bold tracking-wider">{state.data.participantId}</p>
            <p className="text-lg">スタッフにIDを伝えてネームカードを受け取ってね</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-bold">初めての方</h1>
      <p className="text-lg">自分のニックネームをタップしてね</p>
      {state.items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-lg text-muted-foreground">未登録の方はいません</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.items.map((item) => (
            <li key={item.preRegistrationId}>
              <Button
                type="button"
                variant="outline"
                onClick={() => activate(item.preRegistrationId)}
                className="h-auto w-full justify-start px-6 py-5 text-left text-2xl"
              >
                {item.nickname}（{item.grade}）
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
