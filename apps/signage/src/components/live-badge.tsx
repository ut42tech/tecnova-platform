'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import { AIR_STATUS_META, type AirStatus } from '@/lib/broadcast';

// ステータスを示すピル。活動中/休憩/まもなくは点を脈動させる（reduced-motion 時は静止）。
export function LiveBadge({ status, className }: { status: AirStatus; className?: string }) {
  const reduced = useReducedMotion();
  const meta = AIR_STATUS_META[status];
  const animate = meta.pulse && !reduced;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 font-bold whitespace-nowrap',
        meta.chip,
        className,
      )}
    >
      <span className="relative flex shrink-0">
        <span className={cn('size-2.5 rounded-full', meta.dot)} />
        {animate && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', meta.dot)}
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }}
          />
        )}
      </span>
      {meta.label}
    </span>
  );
}
