'use client';

import Image from 'next/image';
import type { AirStatus } from '@/lib/broadcast';
import { jstHm } from '@/lib/time';
import { LiveBadge } from './live-badge';

const jstDate = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

// 配信フレーム最上段。ワードマーク・ステータス・大きな時計（JST）。
export function StageHeader({ now, status }: { now: Date; status: AirStatus }) {
  return (
    <header className="flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)]">
      <Image
        src="/logo_tecnova.png"
        alt="tec-nova"
        width={153}
        height={40}
        priority
        className="h-[clamp(2rem,4.4vh,3.25rem)] w-auto shrink-0"
      />
      <LiveBadge status={status} className="text-[clamp(0.8rem,1.4vw,1.15rem)]" />
      <div className="ml-auto flex items-baseline gap-[clamp(0.5rem,1vw,1rem)]">
        <span className="text-[clamp(0.85rem,1.4vw,1.25rem)] font-bold text-slate-500">
          {jstDate.format(now)}
        </span>
        <span className="text-[clamp(2rem,4vw,3.75rem)] font-black leading-none text-slate-900 tabular-nums">
          {jstHm(now)}
        </span>
      </div>
    </header>
  );
}
