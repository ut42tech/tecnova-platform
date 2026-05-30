'use client';

import { type ChimeKind, cycleChimeEventsForDay } from '@tecnova/shared/activity-cycle';
import { cn } from '@tecnova/ui/lib/utils';
import { jstHm } from '@/lib/time';

const KIND_LABEL: Record<ChimeKind, string> = {
  resume: '活動再開',
  break: '休憩',
  'term-end': 'ターム終了',
};
const KIND_DOT: Record<ChimeKind, string> = {
  resume: 'bg-emerald-500',
  break: 'bg-amber-500',
  'term-end': 'bg-violet-500',
};

// 次2件のチャイムを薄いリストで。リング直下の死に空間を「つぎ なに・いつ」で埋める。
// 直近1件だけ淡く強調し、2件目は地に沈めて優先度を示す。
export function UpNext({ now }: { now: Date }) {
  const upcoming = cycleChimeEventsForDay(now)
    .filter((e) => e.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 2);
  if (upcoming.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-[clamp(0.25rem,0.6vh,0.5rem)]">
      <p className="text-[clamp(0.66rem,1vw,0.82rem)] font-bold text-slate-400">つぎの あいず</p>
      {upcoming.map((e, idx) => (
        <div
          key={e.key}
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-[clamp(0.55rem,1vw,0.85rem)] py-[clamp(0.3rem,0.7vh,0.5rem)]',
            idx === 0 ? 'bg-slate-50 ring-1 ring-slate-900/5' : 'bg-transparent',
          )}
        >
          <span className={cn('size-2 shrink-0 rounded-full', KIND_DOT[e.kind])} />
          <span className="text-[clamp(0.9rem,1.5vw,1.2rem)] font-black text-slate-900 tabular-nums">
            {jstHm(e.at)}
          </span>
          <span className="text-[clamp(0.78rem,1.2vw,1rem)] font-bold text-slate-500">
            {KIND_LABEL[e.kind]}
          </span>
        </div>
      ))}
    </div>
  );
}
