'use client';

import Image from 'next/image';
import { jstHm } from '@/lib/time';

// 待機中（ターム外 / 開始前）に動画パネルへ重ねる明るいウェルカムスライド。
export function IdleOverlay({
  now,
  soon,
  nextStartAt,
  present,
}: {
  now: Date;
  soon: boolean;
  nextStartAt: Date | null;
  present: number;
}) {
  const message = soon
    ? 'まもなく はじまるよ！'
    : nextStartAt
      ? `つぎは ${jstHm(nextStartAt)} から`
      : '本日は おしまい。またね！';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.9rem,2.6vh,2.25rem)] bg-gradient-to-b from-sky-50 to-white text-slate-900">
      <Image
        src="/logo_tecnova.png"
        alt="tec-nova ながさき"
        width={153}
        height={40}
        priority
        className="h-[clamp(2.75rem,8vh,5.5rem)] w-auto"
      />
      <p className="text-[clamp(2rem,5vw,4.5rem)] font-black leading-tight text-slate-900">
        {message}
      </p>
      <p className="text-[clamp(2rem,4.5vw,4rem)] font-black leading-none text-slate-400 tabular-nums">
        {jstHm(now)}
      </p>
      {present > 0 && (
        <p className="text-[clamp(0.95rem,1.6vw,1.4rem)] text-slate-400">
          いま <span className="font-black text-slate-700">{present}</span> 人が さんかちゅう
        </p>
      )}
    </div>
  );
}
