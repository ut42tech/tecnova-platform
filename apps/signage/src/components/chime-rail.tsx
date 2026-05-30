'use client';

import {
  ACTIVITY_MINUTES,
  BREAK_MINUTES,
  type ChimeKind,
  type CycleMoment,
  type CyclePhase,
  cycleChimeEventsForDay,
} from '@tecnova/shared/activity-cycle';
import { TERM_LABELS, TERMS, type TermId } from '@tecnova/shared/venue-schedule';
import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';
import { jstHm } from '@/lib/time';
import { CountdownRing } from './countdown-ring';

// ターム別アクセント（TermBadge と同系統の色）。
const TERM_TONE: Record<TermId, { heading: string; range: string }> = {
  morning: { heading: 'text-sky-700', range: 'text-sky-600' },
  afternoon: { heading: 'text-amber-700', range: 'text-amber-600' },
  evening: { heading: 'text-violet-700', range: 'text-violet-600' },
};

const KIND_LABEL: Record<ChimeKind, string> = {
  resume: '活動再開',
  break: '休憩',
  'term-end': 'ターム終了',
};

function RailCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white/90 p-[clamp(0.9rem,1.6vw,1.5rem)] shadow-sm ring-1 ring-foreground/10 backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface Props {
  phase: CyclePhase;
  moment: CycleMoment;
  now: Date;
  soon: boolean; // ターム内・未稼働（まもなく開始）
  nextStartAt: Date | null; // 次タームの開始時刻（ターム外のみ）
}

// 右レーン＝チャイムの役割を持つゾーン。活動/休憩中は次チャイムまでのカウントダウン、
// idle 中は本日のスケジュールを出す。
export function ChimeRail({ phase, moment, now, soon, nextStartAt }: Props) {
  const isRunning = phase === 'activity' || phase === 'break';

  if (isRunning && moment.term) {
    const def = TERMS.find((t) => t.id === moment.term);
    const tone = TERM_TONE[moment.term];
    const remaining = moment.phaseEndsAt
      ? Math.ceil((moment.phaseEndsAt.getTime() - now.getTime()) / 1000)
      : null;
    const total = (phase === 'activity' ? ACTIVITY_MINUTES : BREAK_MINUTES) * 60;
    const next = cycleChimeEventsForDay(now)
      .filter((e) => e.at.getTime() > now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    const ringTone = phase === 'activity' ? 'emerald' : next?.kind === 'term-end' ? 'amber' : 'sky';
    const ringLabel =
      phase === 'activity'
        ? 'つぎの休憩まで'
        : next?.kind === 'term-end'
          ? 'このタームの終わりまで'
          : '再開まで';
    const targetLabel = next ? `${jstHm(next.at)} に${KIND_LABEL[next.kind]}` : null;
    const cycleIndex = moment.cycleIndex ?? 1;

    return (
      <div className="flex h-full min-h-0 flex-col gap-[clamp(0.75rem,1.4vh,1.25rem)]">
        <RailCard>
          <p className="text-[clamp(0.8rem,1.2vw,1rem)] font-bold text-slate-400">ただいまの部</p>
          <p
            className={cn('text-[clamp(1.6rem,3.4vw,3rem)] font-black leading-tight', tone.heading)}
          >
            {TERM_LABELS[moment.term]}の部
          </p>
          {def && (
            <p
              className={cn(
                'text-[clamp(0.85rem,1.3vw,1.1rem)] font-bold tabular-nums',
                tone.range,
              )}
            >
              {def.start} – {def.end}
            </p>
          )}
        </RailCard>

        <RailCard className="flex flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,1.4vh,1.25rem)]">
          <CountdownRing
            remaining={remaining}
            total={total}
            label={ringLabel}
            targetLabel={targetLabel}
            tone={ringTone}
          />
          <div className="flex items-center gap-3">
            <span className="text-[clamp(0.75rem,1.1vw,0.95rem)] font-bold text-slate-400">
              サイクル {cycleIndex} / 3
            </span>
            <span className="flex items-center gap-1.5">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={cn(
                    'size-2.5 rounded-full',
                    n <= cycleIndex ? 'bg-slate-800' : 'bg-slate-300',
                  )}
                />
              ))}
            </span>
          </div>
        </RailCard>
      </div>
    );
  }

  // idle（ターム外 / 未稼働）：ヘッドライン + 本日のスケジュール。
  const headline = soon ? 'まもなく はじまるよ' : nextStartAt ? 'つぎの活動は' : '本日は おしまい';
  return (
    <div className="flex h-full min-h-0 flex-col gap-[clamp(0.75rem,1.4vh,1.25rem)]">
      <RailCard className="flex flex-col gap-1">
        <p className="text-[clamp(1.4rem,3vw,2.5rem)] font-black leading-tight text-slate-900">
          {headline}
        </p>
        {!soon && nextStartAt && (
          <p className="text-[clamp(1.75rem,4vw,3.25rem)] font-black tabular-nums text-sky-600">
            {jstHm(nextStartAt)}
            <span className="ml-1 text-[0.45em] font-bold text-slate-400">から</span>
          </p>
        )}
      </RailCard>
      <RailCard className="flex flex-1 flex-col gap-[clamp(0.5rem,1vh,0.9rem)]">
        <p className="text-[clamp(0.8rem,1.2vw,1rem)] font-bold text-slate-400">
          本日のスケジュール
        </p>
        {TERMS.map((t) => {
          const isCurrent = moment.term === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2',
                isCurrent ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600',
              )}
            >
              <span className="text-[clamp(0.9rem,1.5vw,1.25rem)] font-black">
                {TERM_LABELS[t.id]}の部
              </span>
              <span className="text-[clamp(0.8rem,1.3vw,1.05rem)] font-bold tabular-nums">
                {t.start}–{t.end}
              </span>
            </div>
          );
        })}
      </RailCard>
    </div>
  );
}
