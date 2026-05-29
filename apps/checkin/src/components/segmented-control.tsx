'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useId } from 'react';

type SegmentedOption<T extends string> = { value: T; label: string; icon?: ReactNode };

// 2 値のモード切替。選択中インジケータが layoutId でスライドする。reduced 時は即切替。
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const prefersReduced = useReducedMotion();
  const layoutId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow-sm"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex h-14 items-center justify-center gap-2 rounded-xl text-lg font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2',
              active ? 'text-primary-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-primary"
                transition={
                  prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }
                }
                aria-hidden="true"
              />
            )}
            <span className="relative flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
