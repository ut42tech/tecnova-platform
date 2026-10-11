'use client';

import {
  IconArrowRight,
  IconCamera,
  IconCameraRotate,
  IconCircleCheck,
  IconClipboardCheck,
  IconKeyboard,
  IconQrcode,
  IconUserPlus,
} from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription } from '@tecnova/ui/components/card';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState, ViewTransition } from 'react';
import { PageShell } from '@/components/page-shell';
import { PanelHeader, type PanelTone } from '@/components/panel-header';
import { Reveal } from '@/components/reveal';
import { ScanReticle } from '@/components/scan-reticle';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';

// 読み取りを始めてから、QR が読めないままカメラを止めて待機に戻るまでの時間。
const SCAN_TIMEOUT_MS = 20_000;

function ActionPanel({
  index,
  title,
  description,
  icon,
  tone,
  href,
  action,
  buttonVariant = 'default',
}: {
  index: number;
  title: string;
  description: string;
  icon: ReactNode;
  tone: PanelTone;
  href: string;
  action: string;
  buttonVariant?: 'default' | 'outline';
}) {
  return (
    <Reveal index={index} className="flex">
      <Card size="sm" className="flex h-full w-full flex-col gap-2 py-4 shadow-sm">
        <PanelHeader icon={icon} title={title} tone={tone} />
        <CardContent className="flex flex-1 flex-col gap-2">
          <CardDescription className="text-sm leading-relaxed text-foreground lg:text-base">
            {description}
          </CardDescription>
          <div className="flex-1" />
          <Button asChild variant={buttonVariant} size="lg" className="h-11 w-full text-base">
            <Link href={href}>
              {action}
              <IconArrowRight className="size-5" data-icon="inline-end" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </Reveal>
  );
}

export default function Home() {
  const router = useRouter();
  const prefersReduced = useReducedMotion();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const navigatingRef = useRef(false);
  const navTimerRef = useRef<number | null>(null);

  const refreshVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === 'videoinput',
    );
    setVideoDevices(devices);
    return devices;
  }, []);

  // カメラは「読み取る」を押したときだけ起動し、読めたら or タイムアウトで止める。
  // iPad の Safari で起動しっぱなしにすると、映像は動いているのに QR を読まなくなる事象があり、
  // 「カメラを再起動すれば読める」という現場の実績に合わせて、毎回起動し直した状態で読み取る。
  // プロフィールへ遷移中もスキャナを止めて、同じQRの連続検出を避ける。
  useEffect(() => {
    if (!scanning || navigatingId) return;
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    setCameraError(null);
    void refreshVideoDevices();

    const timeoutTimer = window.setTimeout(() => setScanning(false), SCAN_TIMEOUT_MS);
    const startTimer = window.setTimeout(() => {
      reader
        .decodeFromVideoDevice(selectedDeviceId, video, (result) => {
          if (cancelled || !result) return;
          const value = result.getText().trim();
          // 5桁の内製ID形式以外は無視（誤読防止）
          if (!PARTICIPANT_ID_PATTERN.test(value)) return;
          if (navigatingRef.current) return;
          navigatingRef.current = true;
          controlsRef.current?.stop();
          setNavigatingId(value);
          navTimerRef.current = window.setTimeout(() => {
            router.push(participantProfilePath(value));
          }, 450);
        })
        .then((controls) => {
          if (cancelled) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;
          void refreshVideoDevices();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('play() request was interrupted')) return;
          setCameraError(msg);
          setScanning(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(timeoutTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [navigatingId, refreshVideoDevices, router, scanning, selectedDeviceId]);

  // ナビゲーション遅延タイマーはアンマウント時のみ掃除する。
  // スキャナ effect の cleanup（navigatingId 変更で毎回走る）で消すと遷移がキャンセルされるため分離する。
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        window.clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  const switchCamera = async () => {
    const devices = videoDevices.length > 0 ? videoDevices : await refreshVideoDevices();
    if (devices.length > 1) {
      const currentIndex = selectedDeviceId
        ? devices.findIndex((device) => device.deviceId === selectedDeviceId)
        : -1;
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 1;
      setSelectedDeviceId(devices[nextIndex]?.deviceId);
    }
    // 切り替えたカメラの映像をすぐ確認できるよう、待機中なら読み取りも始める。
    setScanning(true);
  };

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <section className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
          <Reveal index={0} className="flex">
            <Card className="flex h-full w-full flex-col border-sky-200 shadow-sm">
              <PanelHeader
                icon={<IconQrcode className="size-8" />}
                title="QRコードをかざしてね"
                tone="sky"
              />
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="relative min-h-72 w-full flex-1 overflow-hidden rounded-lg bg-slate-950 lg:h-[clamp(280px,calc(100svh-340px),560px)] lg:flex-none">
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                  {scanning && !navigatingId && <ScanReticle />}
                  {navigatingId && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6">
                      <ViewTransition name="participant-portal">
                        <motion.div
                          className="flex flex-col items-center gap-3 rounded-2xl bg-emerald-500 px-10 py-7 text-center text-white shadow-xl"
                          initial={prefersReduced ? false : { scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={
                            prefersReduced ? undefined : { duration: 0.25, ease: 'easeOut' }
                          }
                        >
                          <motion.span
                            initial={prefersReduced ? false : { scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={
                              prefersReduced
                                ? undefined
                                : { type: 'spring', stiffness: 420, damping: 18, delay: 0.05 }
                            }
                          >
                            <IconCircleCheck className="size-14" aria-hidden="true" />
                          </motion.span>
                          <p className="text-lg font-black">プロフィールを開いています</p>
                          <p className="text-4xl font-black tracking-widest tabular-nums">
                            {navigatingId}
                          </p>
                        </motion.div>
                      </ViewTransition>
                    </div>
                  )}
                  {!scanning && !navigatingId && (
                    <button
                      type="button"
                      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/85 p-6 text-center text-white transition-colors hover:bg-slate-950/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
                      onClick={() => setScanning(true)}
                    >
                      <span className="flex size-24 items-center justify-center rounded-full bg-sky-500 shadow-lg">
                        <IconQrcode className="size-14" aria-hidden="true" />
                      </span>
                      <span className="text-2xl font-black">タップしてQRを読み取る</span>
                      {cameraError && (
                        <span className="flex items-center gap-2 text-base font-bold text-rose-200">
                          <IconCamera className="size-5" aria-hidden="true" />
                          カメラを起動できませんでした。もう一度タップしてください
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 w-full text-base"
                  disabled={navigatingId !== null}
                  onClick={() => void switchCamera()}
                >
                  <IconCameraRotate className="size-5" data-icon="inline-start" />
                  カメラ切り替え
                </Button>
              </CardContent>
            </Card>
          </Reveal>

          <div className="grid h-full gap-2 sm:grid-cols-3 lg:grid-cols-1 lg:grid-rows-3">
            <ActionPanel
              index={1}
              title="初めての人"
              description="IDカードがない人はこちら。"
              icon={<IconUserPlus className="size-8" />}
              tone="emerald"
              href="/first-time"
              action="初回登録へ"
            />
            <ActionPanel
              index={2}
              title="受付りれき"
              description="今日の受付状況を確認します。"
              icon={<IconClipboardCheck className="size-8" />}
              tone="sky"
              href="/history"
              action="履歴を見る"
            />
            <ActionPanel
              index={3}
              title="マニュアル入力"
              description="QRコードが読めないときはこちら。"
              icon={<IconKeyboard className="size-8" />}
              tone="slate"
              href="/manual"
              action="入力へ"
              buttonVariant="outline"
            />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
