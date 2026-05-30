'use client';

import { TERM_LABELS, type TermId } from '@tecnova/shared/venue-schedule';
import { jstHm, mmss } from '@/lib/time';

interface Props {
  term: TermId;
  now: Date;
  present: number;
  secondsToBreak: number | null;
}

export function InfoBar({ term, now, present, secondsToBreak }: Props) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-slate-950/55 px-6 py-3 text-white backdrop-blur">
      <span className="rounded-full bg-amber-400 px-3 py-0.5 text-sm font-extrabold text-slate-900">
        {TERM_LABELS[term]}の部
      </span>
      <span className="text-2xl font-extrabold tabular-nums">{jstHm(now)}</span>
      {secondsToBreak !== null && (
        <span className="text-base text-slate-200">休憩まで {mmss(secondsToBreak)}</span>
      )}
      <span className="ml-auto text-base text-slate-200">
        在館 <span className="text-xl font-extrabold">{present}</span> 人
      </span>
    </div>
  );
}
