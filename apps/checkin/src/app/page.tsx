'use client';

import type { ScanResponse } from '@tecnova/shared/schemas';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

type State =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'result'; data: ScanResponse }
  | { kind: 'error'; message: string };

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return `${h}時間${m}分`;
};

export default function Home() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [input, setInput] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.kind === 'scanning') return;
    setState({ kind: 'scanning' });
    try {
      const r = await fetch(`${API_URL}/checkin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanValue: input }),
      });
      const body = (await r.json()) as ScanResponse | { error: string; message: string };
      if (!r.ok) {
        const msg = 'message' in body ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setState({ kind: 'result', data: body as ScanResponse });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const reset = () => {
    setInput('');
    setState({ kind: 'idle' });
  };

  if (state.kind === 'scanning') {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-xl">確認中...</p>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-xl text-red-600">エラー: {state.message}</p>
        <button type="button" onClick={reset} className="rounded-lg bg-zinc-200 px-6 py-3 text-lg">
          戻る
        </button>
      </main>
    );
  }

  if (state.kind === 'result') {
    const { data } = state;
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        {data.action === 'check_in' ? (
          <>
            <h1 className="text-4xl font-bold">{data.nickname}さん、こんにちは！</h1>
            <p className="text-lg">チェックインしました</p>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-bold">{data.nickname}さん、お疲れさま！</h1>
            <p className="text-lg">今日の滞在時間: {formatDuration(data.stayDurationMinutes)}</p>
          </>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-semibold text-white"
        >
          戻る
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold">テクノバながさき チェックイン</h1>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-stretch gap-4">
        <label htmlFor="participant-id" className="text-lg text-center">
          IDを入力してね（5桁）
        </label>
        <input
          id="participant-id"
          type="text"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          required
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded-lg border border-zinc-300 px-4 py-4 text-center text-3xl tracking-widest"
        />
        <button
          type="submit"
          disabled={input.length !== 5}
          className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-semibold text-white disabled:bg-zinc-300"
        >
          チェックイン / アウト
        </button>
      </form>
      <Link href="/first-time" className="text-lg text-blue-700 underline">
        初めての方はこちら
      </Link>
    </main>
  );
}
