'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { revealAnimate, revealInitial, revealTransition } from '@/lib/motion';

// 子をフェードアップで入場させる薄いラッパ。index でセクション間のスタッガーをずらす。
// データ一覧は「カードごと」ではなく、本ラッパでまとめて一度だけ入場させる
// （Cohesive Elevation。再フェッチのたびにカスケードが再生されるのを避けるため、
//  ラッパは loading/ok を切り替える領域の“外側”に常時マウントして使う）。
// prefers-reduced-motion 時は initial を無効化して即表示する。
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={prefersReduced ? false : revealInitial}
      animate={revealAnimate}
      transition={prefersReduced ? undefined : revealTransition(index)}
    >
      {children}
    </motion.div>
  );
}
