'use client';

import {
  IconArrowRight,
  IconCamera,
  IconCameraRotate,
  IconCircleCheck,
  IconClipboardCheck,
  IconKeyboard,
  IconQrcode,
  IconRefresh,
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
  const [scannerAttempt, setScannerAttempt] = useState(0);
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

  // プロフィールへ遷移中はスキャナを止めて、同じQRの連続検出を避ける。
  // biome-ignore lint/correctness/useExhaustiveDependencies: scannerAttempt is an explicit restart token for reinitializing the camera.
  useEffect(() => {
    if (navigatingId) return;
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    setCameraError(null);
    void refreshVideoDevices();

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
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [navigatingId, refreshVideoDevices, router, scannerAttempt, selectedDeviceId]);

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
    if (devices.length <= 1) {
      setScannerAttempt((attempt) => attempt + 1);
      return;
    }

    const currentIndex = selectedDeviceId
      ? devices.findIndex((device) => device.deviceId === selectedDeviceId)
      : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 1;
    setSelectedDeviceId(devices[nextIndex]?.deviceId);
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
                  {!navigatingId && !cameraError && <ScanReticle />}
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
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 p-6 text-center text-lg font-bold text-white">
                      <IconCamera className="mr-3 size-8" aria-hidden="true" />
                      カメラを起動できませんでした
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 text-base"
                    disabled={navigatingId !== null}
                    onClick={() => setScannerAttempt((attempt) => attempt + 1)}
                  >
                    <IconRefresh className="size-5" data-icon="inline-start" />
                    カメラを再起動
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 text-base"
                    disabled={navigatingId !== null}
                    onClick={() => void switchCamera()}
                  >
                    <IconCameraRotate className="size-5" data-icon="inline-start" />
                    カメラ切り替え
                  </Button>
                </div>
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
