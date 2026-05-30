'use client';

import { ACTIVITY_MINUTES, BREAK_MINUTES } from '@tecnova/shared/activity-cycle';
import { TERMS, type TermId } from '@tecnova/shared/venue-schedule';
import { cn } from '@tecnova/ui/lib/utils';

const CYCLE_MINUTES = ACTIVITY_MINUTES + BREAK_MINUTES; // 60

// 'HH:mm' → 通算分（venue-schedule のヘルパは非公開のため再宣言）。
const toMin = (hhmm: string): number =>
  Number.parseInt(hhmm.slice(0, 2), 10) * 60 + Number.parseInt(hhmm.slice(3, 5), 10);

// now を JST 通算分に（activity-cycle 内部と同手法。Asia/Tokyo は固定 UTC+9）。
const jstMinFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const nowJstMin = (d: Date): number => {
  const [h, m] = jstMinFmt.format(d).split(':');
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
};

// タームを 3サイクル×（活動50/休憩10）の6セグメント帯にし、現在位置をマーカーで示す。
// 冗長だった「サイクル N/3 ＋ 3ドット」をこの帯へ統合する。
export function TermTimeline({
  term,
  now,
  markerClass,
}: {
  term: TermId;
  now: Date;
  markerClass: string; // 現フェーズ色（bg-emerald-500 など）
}) {
  const def = TERMS.find((t) => t.id === term);
  if (!def) return null;
  const start = toMin(def.start);
  const end = toMin(def.end);
  const cycles = Math.round((end - start) / CYCLE_MINUTES);
  const cur = Math.max(start, Math.min(end, nowJstMin(now)));
  const progress = (cur - start) / (end - start); // ターム全体での 0..1

  // 6セグメント（3サイクル × 活動/休憩）を先に組み立てる（key はサイクル種別で安定）。
  const segments: { id: string; grow: number; lit: boolean; now: boolean; isBreak: boolean }[] = [];
  for (let c = 0; c < cycles; c += 1) {
    const segStart = start + c * CYCLE_MINUTES;
    segments.push({
      id: `a${c}`,
      grow: ACTIVITY_MINUTES,
      lit: cur >= segStart,
      now: cur >= segStart && cur < segStart + ACTIVITY_MINUTES,
      isBreak: false,
    });
    segments.push({
      id: `b${c}`,
      grow: BREAK_MINUTES,
      lit: cur >= segStart + ACTIVITY_MINUTES,
      now: cur >= segStart + ACTIVITY_MINUTES && cur < segStart + CYCLE_MINUTES,
      isBreak: true,
    });
  }

  return (
    <div className="flex flex-col gap-[clamp(0.3rem,0.7vh,0.55rem)]">
      <div className="flex items-center justify-between text-[clamp(0.62rem,0.95vw,0.78rem)] font-bold text-slate-400 tabular-nums">
        <span>{def.start}</span>
        <span className="text-slate-500">このタームの進み</span>
        <span>{def.end}</span>
      </div>
      <div className="relative">
        <div className="flex h-[clamp(0.5rem,1vh,0.7rem)] gap-[2px] overflow-hidden rounded-full">
          {segments.map((s) => (
            <span
              key={s.id}
              style={{ flexGrow: s.grow }}
              className={cn(
                'rounded-[3px] transition-colors motion-reduce:transition-none',
                s.isBreak
                  ? s.lit
                    ? 'bg-amber-300'
                    : 'bg-slate-100'
                  : s.lit
                    ? 'bg-emerald-400'
                    : 'bg-slate-200',
                s.now && 'ring-1 ring-white/60 ring-inset',
              )}
            />
          ))}
        </div>
        {/* 現在位置マーカー。CSS transition のみ → reduced-motion 尊重。 */}
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 size-[clamp(0.7rem,1.4vw,1rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition-[left] duration-500 ease-linear motion-reduce:transition-none',
            markerClass,
          )}
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
