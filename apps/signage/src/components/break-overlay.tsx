'use client';

import { AnimatedTime } from './animated-time';

// 休憩中に動画パネルへ重ねる明るいスライド（配信の「休憩カード」）。
export function BreakOverlay({
  secondsToResume,
  present,
}: {
  secondsToResume: number | null;
  present: number;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.6rem,1.8vh,1.5rem)] bg-gradient-to-b from-sky-50 to-white text-slate-900">
      <span className="rounded-full bg-amber-100 px-[clamp(1rem,2vw,1.75rem)] py-[clamp(0.3rem,0.8vh,0.6rem)] text-[clamp(1.1rem,2.4vw,2rem)] font-black text-amber-800">
        休憩中
      </span>
      <p className="text-[clamp(0.95rem,1.6vw,1.5rem)] font-bold text-slate-500">つぎの活動まで</p>
      <AnimatedTime
        value={secondsToResume}
        className="text-[clamp(4rem,13vw,10rem)] font-black leading-none text-slate-900"
      />
      <p className="text-[clamp(1rem,2vw,1.6rem)] font-bold text-slate-500">
        すこし やすんで、また あそぼう！
      </p>
      {present > 0 && (
        <p className="text-[clamp(0.9rem,1.5vw,1.25rem)] text-slate-400">
          いま <span className="font-black text-slate-700">{present}</span> 人が あそびちゅう
        </p>
      )}
    </div>
  );
}
