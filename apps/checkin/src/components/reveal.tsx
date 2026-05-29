'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { revealAnimate, revealInitial, revealTransition } from '@/lib/motion';

// 子をフェードアップで入場させる薄いラッパ。index でスタッガーをずらす。
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
