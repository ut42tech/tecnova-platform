'use client';

import { IconArrowRight } from '@tabler/icons-react';
import type { ScanResponse } from '@tecnova/shared/schemas';
import { Button } from '@tecnova/ui/components/button';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
const ID_PATTERN = /^\d{5}$/;

type Mode = 'manual' | 'qr';

type State =
  | { kind: 'idle' }
  | { kind: 'confirming'; value: string; source: Mode }
  | { kind: 'submitting' }
  | { kind: 'result'; data: ScanResponse }
  | { kind: 'error'; message: string };

const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return `${h}時間${m}分`;
};

export default function Home() {
  const [mode, setMode] = useState<Mode>('manual');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [input, setInput] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  // QR モードかつ idle のときだけスキャナを起動。
  // 確認画面・送信中・結果表示中は止めて誤検出と無駄な CPU を避ける。
  useEffect(() => {
    if (mode !== 'qr' || state.kind !== 'idle') return;
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    setCameraError(null);

    reader
      .decodeFromVideoDevice(undefined, video, (result) => {
        if (cancelled || !result) return;
        const value = result.getText().trim();
        // 5桁の内製ID形式以外は無視（誤読防止）
        if (!ID_PATTERN.test(value)) return;
        // 一度認識したら即時 API は叩かず、確認画面でクッションを置く
        setState({ kind: 'confirming', value, source: 'qr' });
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(msg);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, state.kind]);

  const runScan = async (value: string) => {
    setState({ kind: 'submitting' });
    try {
      const r = await fetch(`${API_URL}/checkin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanValue: value }),
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

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!ID_PATTERN.test(input)) return;
    void runScan(input);
  };

  const confirmSubmit = () => {
    if (state.kind !== 'confirming') return;
    void runScan(state.value);
  };

  const cancelConfirm = () => {
    setState({ kind: 'idle' });
  };

  const reset = () => {
    setInput('');
    setState({ kind: 'idle' });
  };

  if (state.kind === 'submitting') {
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

  if (state.kind === 'confirming') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
        <h1 className="text-2xl font-bold">この ID で合っていますか？</h1>
        <p className="text-6xl font-bold tracking-widest tabular-nums">{state.value}</p>
        <p className="text-sm text-zinc-500">
          {state.source === 'qr' ? 'QRコードから読み取りました' : '手入力で確認します'}
        </p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={cancelConfirm}
            className="rounded-lg bg-zinc-200 px-8 py-4 text-xl"
          >
            やり直す
          </button>
          <button
            type="button"
            onClick={confirmSubmit}
            className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-semibold text-white"
          >
            チェックイン / アウト
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">テクノバながさき チェックイン</h1>

      {mode === 'manual' ? (
        <>
          <form
            onSubmit={submitManual}
            className="flex w-full max-w-sm flex-col items-stretch gap-4"
          >
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
            <Button type="submit" size="lg" disabled={input.length !== 5}>
              チェックイン / アウト
              <IconArrowRight data-icon="inline-end" />
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode('qr')}
            className="rounded-lg border border-zinc-400 px-6 py-3 text-base"
          >
            QRコードで読み取る（試験運用）
          </button>
        </>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
          <p className="text-center text-lg">QRコードをかざしてね</p>
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
                カメラを起動できませんでした: {cameraError}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className="rounded-lg border border-zinc-400 px-6 py-3 text-base"
          >
            手入力に戻る
          </button>
        </div>
      )}

      <Link href="/first-time" className="text-lg text-blue-700 underline">
        初めての方はこちら
      </Link>
    </main>
  );
}
