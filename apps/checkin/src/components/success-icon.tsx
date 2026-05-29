'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export const ringToneClasses: Record<'emerald' | 'amber', string> = {
  emerald: 'border-emerald-400',
  amber: 'border-amber-400',
};

export function SuccessIcon({
  tone,
  prefersReduced,
  children,
}: {
  tone: 'emerald' | 'amber';
  prefersReduced: boolean;
  children: ReactNode;
}) {
  return (
    <span className="relative flex items-center justify-center">
      {!prefersReduced && (
        <motion.span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 rounded-full border-2',
            ringToneClasses[tone],
          )}
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
        />
      )}
      <motion.span
        className="relative flex items-center justify-center"
        initial={prefersReduced ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          prefersReduced ? undefined : { type: 'spring', stiffness: 420, damping: 18, delay: 0.05 }
        }
      >
        {children}
      </motion.span>
    </span>
  );
}
