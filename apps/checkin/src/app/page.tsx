'use client';

import { IconArrowRight } from '@tabler/icons-react';
import type { ScanResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
import { Input } from '@tecnova/ui/components/input';
import { Label } from '@tecnova/ui/components/label';
import { Skeleton } from '@tecnova/ui/components/skeleton';
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
        <Skeleton className="h-8 w-32" />
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <Alert variant="destructive" className="max-w-md text-left">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        <Button type="button" variant="secondary" size="lg" onClick={reset}>
          戻る
        </Button>
      </main>
    );
  }

  if (state.kind === 'result') {
    const { data } = state;
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-4xl">
              {data.action === 'check_in'
                ? `${data.nickname}さん、こんにちは！`
                : `${data.nickname}さん、お疲れさま！`}
            </CardTitle>
            <CardDescription className="text-lg">
              {data.action === 'check_in'
                ? 'チェックインしました'
                : `今日の滞在時間: ${formatDuration(data.stayDurationMinutes)}`}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button type="button" size="lg" onClick={reset} className="w-full text-xl">
              戻る
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  if (state.kind === 'confirming') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="text-2xl">この ID で合っていますか？</CardTitle>
            <CardDescription>
              {state.source === 'qr' ? 'QRコードから読み取りました' : '手入力で確認します'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-6xl font-bold tracking-widest tabular-nums">{state.value}</p>
          </CardContent>
          <CardFooter className="grid grid-cols-2 gap-4">
            <Button type="button" variant="secondary" size="lg" onClick={cancelConfirm}>
              やり直す
            </Button>
            <Button type="button" size="lg" onClick={confirmSubmit}>
              チェックイン / アウト
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">テクノバながさき チェックイン</h1>

      {mode === 'manual' ? (
        <>
          <form onSubmit={submitManual} className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle>IDを入力してね</CardTitle>
                <CardDescription>5桁の参加者IDを入力してください</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Label htmlFor="participant-id" className="justify-center text-lg">
                  参加者ID
                </Label>
                <Input
                  id="participant-id"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  required
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="h-auto px-4 py-4 text-center text-3xl tracking-widest"
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" size="lg" disabled={input.length !== 5} className="w-full">
                  チェックイン / アウト
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </form>
          <Button type="button" variant="outline" size="lg" onClick={() => setMode('qr')}>
            QRコードで読み取る（試験運用）
          </Button>
        </>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
          <Card>
            <CardHeader>
              <CardTitle>QRコードをかざしてね</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
                    カメラを起動できませんでした: {cameraError}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Button type="button" variant="outline" size="lg" onClick={() => setMode('manual')}>
            手入力に戻る
          </Button>
        </div>
      )}

      <Button asChild variant="link" size="lg">
        <Link href="/first-time">初めての方はこちら</Link>
      </Button>
    </main>
  );
}
