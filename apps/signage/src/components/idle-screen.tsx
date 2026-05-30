'use client';

import { jstHm } from '@/lib/time';

interface Props {
  show: boolean;
  soon: boolean; // ターム内だが未稼働（初回チェックイン前）＝「まもなく開始」
  now: Date;
  nextStartAt: Date | null; // 次の活動開始（境界）。ターム外のときのみ算出。
  present: number;
}

export function IdleScreen({ show, soon, now, nextStartAt, present }: Props) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-slate-950 text-white transition-opacity duration-500 motion-reduce:transition-none ${
        show ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="text-5xl font-black tracking-wide">tec-nova Nagasaki</p>
      <p className="text-6xl font-extrabold tabular-nums">{jstHm(now)}</p>
      <p className="text-2xl text-slate-300">
        {soon ? 'まもなく開始' : nextStartAt ? `次は ${jstHm(nextStartAt)} から` : '本日は終了しました'}
      </p>
      {present > 0 && <p className="text-lg text-slate-400">在館 {present} 人</p>}
    </div>
  );
}
