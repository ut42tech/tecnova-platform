'use client';

import {
  IconArrowRight,
  IconBug,
  IconCamera,
  IconCameraRotate,
  IconQrcode,
  IconRefresh,
  IconUserPlus,
} from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription } from '@tecnova/ui/components/card';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { PanelHeader, type PanelTone } from '@/components/panel-header';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';

function ActionPanel({
  title,
  description,
  icon,
  tone,
  href,
  action,
  buttonVariant = 'default',
}: {
  title: string;
  description: string;
  icon: ReactNode;
  tone: PanelTone;
  href: string;
  action: string;
  buttonVariant?: 'default' | 'outline';
}) {
  return (
    <Card className="flex h-full flex-col shadow-sm">
      <PanelHeader icon={icon} title={title} tone={tone} />
      <CardContent className="flex flex-1 flex-col gap-4">
        <CardDescription className="text-lg text-foreground">{description}</CardDescription>
        <div className="flex-1" />
        <Button asChild variant={buttonVariant} size="lg" className="h-16 w-full text-xl">
          <Link href={href}>
            {action}
            <IconArrowRight className="size-6" data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const router = useRouter();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerAttempt, setScannerAttempt] = useState(0);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const navigatingRef = useRef(false);

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
          router.push(participantProfilePath(value));
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
    <main className="flex flex-1 flex-col bg-sky-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
          <Card className="flex h-full flex-col shadow-sm">
            <PanelHeader
              icon={<IconQrcode className="size-8" />}
              title="QRコードをかざしてね"
              tone="sky"
            />
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="relative min-h-72 w-full flex-1 overflow-hidden rounded-lg bg-slate-950 lg:h-[clamp(280px,calc(100svh-340px),560px)] lg:flex-none">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                {navigatingId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-6 text-center text-white">
                    <IconQrcode className="size-12" aria-hidden="true" />
                    <p className="text-2xl font-black">プロフィールを開いています</p>
                    <p className="text-4xl font-black tracking-widest tabular-nums">
                      {navigatingId}
                    </p>
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

          <div className="grid h-full gap-4 lg:grid-rows-2">
            <ActionPanel
              title="初めての人"
              description="IDカードをまだ持っていない人はこちら。"
              icon={<IconUserPlus className="size-8" />}
              tone="emerald"
              href="/first-time"
              action="初回登録へ"
            />

            <ActionPanel
              title="マニュアル入力"
              description="QRコードが読めないときや、スタッフが確認するときに使います。"
              icon={<IconBug className="size-8" />}
              tone="slate"
              href="/manual"
              action="入力へ"
              buttonVariant="outline"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
