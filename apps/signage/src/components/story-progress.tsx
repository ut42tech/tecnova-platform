'use client';

import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';
import { useRef } from 'react';
import { STORY_DURATION_MS } from '@/lib/motion';

// アニメーションする進行バー（active のみ MotionValue で満ちる）。本コンポーネントは
// animate=true のときだけマウントされるので、reduced-motion / 単一スライド時は RAF を回さない。
// progress は MotionValue＝毎フレーム更新でも React 再レンダを起こさない（バー幅を直接更新）。
export function StoryProgress({
  count,
  index,
  onAdvance,
}: {
  count: number;
  index: number;
  onAdvance: () => void;
}) {
  const progress = useMotionValue(0);
  const widthPct = useTransform(progress, (p) => `${Math.max(0, Math.min(1, p)) * 100}%`);
  const startRef = useRef<number | null>(null);
  // 最新 index と「いまバーが満ちている対象 index」をフレームループから参照する。
  const indexRef = useRef(index);
  const barIndexRef = useRef(index);
  const onAdvanceRef = useRef(onAdvance);
  indexRef.current = index;
  onAdvanceRef.current = onAdvance;

  useAnimationFrame((t) => {
    // index が変わったら（自動送り・debug の手動送り両方）バーを 0 から満ち直す。
    if (barIndexRef.current !== indexRef.current) {
      barIndexRef.current = indexRef.current;
      startRef.current = t;
      progress.set(0);
    }
    if (startRef.current === null) startRef.current = t;
    const p = (t - startRef.current) / STORY_DURATION_MS;
    if (p >= 1) {
      startRef.current = t;
      progress.set(0);
      onAdvanceRef.current();
      return;
    }
    progress.set(p);
  });

  const segments = Array.from({ length: count }, (_, n) => ({
    id: `seg-${n}`,
    state: n < index ? 'done' : n === index ? 'active' : 'todo',
  }));

  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {segments.map((s) => (
        <span
          key={s.id}
          className="h-1.5 w-[clamp(0.9rem,1.6vw,1.6rem)] overflow-hidden rounded-full bg-slate-200"
        >
          {s.state === 'active' ? (
            <motion.span
              className="block h-full rounded-full bg-slate-800 will-change-[width]"
              style={{ width: widthPct }}
            />
          ) : (
            <span
              className="block h-full rounded-full bg-slate-800"
              style={{ width: s.state === 'done' ? '100%' : '0%' }}
            />
          )}
        </span>
      ))}
    </span>
  );
}
