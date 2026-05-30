'use client';

import { mmss } from '@/lib/time';

interface Props {
  show: boolean;
  secondsToResume: number | null;
  present: number;
}

// 動画レイヤの上に重ね、opacity でクロスフェード。動画は裏で pause（YouTube iframe は
// アンマウントしない＝再読込フラッシュ防止）。prefers-reduced-motion 時は transition を無効化。
export function BreakScreen({ show, secondsToResume, present }: Props) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-slate-950 text-white transition-opacity duration-500 motion-reduce:transition-none ${
        show ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="text-3xl font-extrabold text-amber-300">休憩中</p>
      <p className="text-[10rem] font-black leading-none tabular-nums">
        {secondsToResume !== null ? mmss(secondsToResume) : '--:--'}
      </p>
      <p className="text-2xl text-slate-300">再開までの時間</p>
      <p className="text-lg text-slate-400">
        在館 <span className="font-extrabold text-slate-200">{present}</span> 人
      </p>
    </div>
  );
}
