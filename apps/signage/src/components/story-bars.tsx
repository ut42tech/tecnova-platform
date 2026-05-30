'use client';

// 静的な進行バー（reduced-motion / 単一スライド時のフォールバック）。アニメは無く、
// 現在地までを満タンで示すだけ。アニメ版は StoryProgress（MotionValue 駆動）。
export function StoryBars({ count, index }: { count: number; index: number }) {
  const segments = Array.from({ length: count }, (_, n) => ({
    id: `seg-${n}`,
    fill: n <= index ? 1 : 0,
  }));
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {segments.map((s) => (
        <span
          key={s.id}
          className="h-1.5 w-[clamp(0.9rem,1.6vw,1.6rem)] overflow-hidden rounded-full bg-slate-200"
        >
          <span
            className="block h-full rounded-full bg-slate-800"
            style={{ width: `${s.fill * 100}%` }}
          />
        </span>
      ))}
    </span>
  );
}
