'use client';

import type {
  ActivateResponse,
  PreRegisteredListResponse,
  PreRegisteredParticipant,
} from '@tecnova/shared/schemas';
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
        <p className="text-xl">読み込み中...</p>
      </main>
    );
  }

  if (state.kind === 'activating') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-xl">登録中...</p>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-xl text-red-600">エラー: {state.message}</p>
      </main>
    );
  }

  if (state.kind === 'result') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-4xl font-bold">{state.data.nickname}さん、ようこそ！</h1>
        <p className="text-lg">あなたのIDは</p>
        <p className="text-7xl font-bold tracking-wider">{state.data.participantId}</p>
        <p className="text-lg">スタッフにIDを伝えてネームカードを受け取ってね</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-bold">初めての方</h1>
      <p className="text-lg">自分のニックネームをタップしてね</p>
      {state.items.length === 0 ? (
        <p className="text-lg text-zinc-600">未登録の方はいません</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.items.map((item) => (
            <li key={item.preRegistrationId}>
              <button
                type="button"
                onClick={() => activate(item.preRegistrationId)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-6 py-5 text-left text-2xl hover:bg-zinc-50"
              >
                {item.nickname}（{item.grade}）
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
