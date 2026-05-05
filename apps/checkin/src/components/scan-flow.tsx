'use client';

import {
  IconAlertCircle,
  IconArrowRight,
  IconHome,
  IconKeyboard,
  IconLogin2,
  IconLogout2,
  IconQrcode,
  IconRefresh,
} from '@tabler/icons-react';
import type { ScanResponse } from '@tecnova/shared/schemas';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tecnova/ui/components/card';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import Link from 'next/link';
import { ResultSummaryCard } from '@/components/result-summary-card';
import { formatDuration, formatJapaneseDateTime } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export const ID_PATTERN = /^\d{5}$/;

export type ScanSource = 'manual' | 'qr';

export type ScanFlowState =
  | { kind: 'idle' }
  | { kind: 'confirming'; value: string; source: ScanSource }
  | { kind: 'submitting' }
  | { kind: 'result'; data: ScanResponse; participantId: string }
  | { kind: 'error'; message: string };

export const scanParticipant = async (value: string): Promise<ScanResponse> => {
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
  return body as ScanResponse;
};

export function ScanSubmittingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center bg-sky-50 p-6">
      <Card className="w-full max-w-md border-sky-200 text-center shadow-sm">
        <CardHeader className="items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sky-100">
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
          <CardTitle className="text-3xl">確認しています</CardTitle>
          <CardDescription className="text-lg">そのまま少し待ってね</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export function ScanErrorScreen({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>エラー</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <Button type="button" size="lg" onClick={onReset} className="h-16 min-w-56 text-xl">
        <IconRefresh className="size-6" data-icon="inline-start" />
        もう一度
      </Button>
    </main>
  );
}

export function ScanResultScreen({
  data,
  participantId,
  onReset,
}: {
  data: ScanResponse;
  participantId: string;
  onReset: () => void;
}) {
  const isCheckIn = data.action === 'check_in';
  const resultRow = isCheckIn
    ? { label: 'チェックイン時刻', value: formatJapaneseDateTime(data.checkedInAt) }
    : { label: '滞在時間', value: formatDuration(data.stayDurationMinutes) };

  return (
    <ResultSummaryCard
      title={isCheckIn ? 'チェックイン' : 'チェックアウト'}
      tone={isCheckIn ? 'emerald' : 'amber'}
      icon={isCheckIn ? <IconLogin2 className="size-8" /> : <IconLogout2 className="size-8" />}
      rows={[
        {
          label: 'ID',
          value: participantId,
          valueClassName: 'tabular-nums',
        },
        { label: 'ニックネーム', value: data.nickname },
        { label: '結果', value: isCheckIn ? 'チェックインしました' : 'チェックアウトしました' },
        resultRow,
      ]}
      footer={
        <Button asChild size="lg" className="h-16 w-full text-xl">
          <Link href="/" onClick={onReset}>
            <IconHome className="size-6" data-icon="inline-start" />
            ホームに戻る
          </Link>
        </Button>
      }
    />
  );
}

export function ScanConfirmScreen({
  value,
  source,
  onCancel,
  onConfirm,
}: {
  value: string;
  source: ScanSource;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-sky-50 p-6 text-center">
      <Card className="w-full max-w-2xl border-sky-200 shadow-sm">
        <CardHeader className="gap-3">
          <Badge
            variant="secondary"
            style={{ height: 'auto' }}
            className="mx-auto px-4 py-2 text-base"
          >
            {source === 'qr' ? (
              <IconQrcode className="size-4" data-icon="inline-start" />
            ) : (
              <IconKeyboard className="size-4" data-icon="inline-start" />
            )}
            {source === 'qr' ? 'QRコードから読み取りました' : 'マニュアル入力で確認します'}
          </Badge>
          <CardTitle className="text-3xl leading-tight sm:text-4xl">
            この ID で合っていますか？
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8">
          <p className="text-7xl font-black tracking-widest tabular-nums sm:text-8xl">{value}</p>
        </CardContent>
        <CardFooter className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onCancel}
            className="h-16 text-2xl"
          >
            <IconRefresh className="size-7" data-icon="inline-start" />
            やり直す
          </Button>
          <Button type="button" size="lg" onClick={onConfirm} className="h-16 text-2xl">
            はい
            <IconArrowRight className="size-7" data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
