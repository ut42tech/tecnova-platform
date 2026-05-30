'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { mmss } from '@/lib/time';

type Tone = 'emerald' | 'amber' | 'sky';

const TONE_STROKE: Record<Tone, string> = {
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  sky: 'text-sky-500',
};

interface Props {
  remaining: number | null; // 現フェーズの残り秒
  total: number; // 現フェーズの全長（秒）
  label: string; // 例: つぎの休憩まで
  targetLabel: string | null; // 例: 12:50 に休憩
  tone: Tone;
}

// 次のチャイムまでのカウントダウン。リングが減っていく＝「チャイムの役割」の視覚化。
export function CountdownRing({ remaining, total, label, targetLabel, tone }: Props) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const frac = remaining === null || total <= 0 ? 0 : Math.max(0, Math.min(1, remaining / total));
  const offset = C * (1 - frac);
  return (
    <div className="flex flex-col items-center gap-[clamp(0.4rem,0.8vh,0.75rem)]">
      <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] font-bold text-slate-500">{label}</p>
      <div className="relative grid place-items-center">
        <svg
          viewBox="0 0 100 100"
          className="size-[clamp(7.5rem,15vw,12rem)] -rotate-90"
          role="img"
          aria-label={remaining === null ? label : `${label} ${mmss(remaining)}`}
        >
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="7"
            className="stroke-current text-slate-200"
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={cn(
              'stroke-current transition-[stroke-dashoffset] duration-500 ease-linear motion-reduce:transition-none',
              TONE_STROKE[tone],
            )}
          />
        </svg>
        <span className="absolute text-[clamp(1.75rem,3.4vw,3rem)] font-black leading-none text-slate-900 tabular-nums">
          {remaining === null ? '--:--' : mmss(remaining)}
        </span>
      </div>
      {targetLabel && (
        <p className="text-[clamp(0.75rem,1.1vw,0.95rem)] text-slate-500">{targetLabel}</p>
      )}
    </div>
  );
}
