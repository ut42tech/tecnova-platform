'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';

// 滞在中=emerald の脈動、未滞在=slate の静止。プロフィール画面の在席ドットと同じ演出。
export function LiveDot({ active, className }: { active: boolean; className?: string }) {
  const prefersReduced = useReducedMotion();

  if (!active) {
    return (
      <span className={cn('size-2.5 rounded-full bg-slate-400', className)} aria-hidden="true" />
    );
  }

  return (
    <motion.span
      className={cn('size-2.5 rounded-full bg-emerald-500', className)}
      animate={prefersReduced ? undefined : { scale: [1, 1.35, 1], opacity: [1, 0.5, 1] }}
      transition={
        prefersReduced
          ? undefined
          : { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
      }
      aria-hidden="true"
    />
  );
}
