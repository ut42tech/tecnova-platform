import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';

export type StatTone = 'neutral' | 'emerald';

// 集計値タイル。value は ReactNode（AnimatedNumber + 単位サフィックス等）を想定。
export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  const isEmerald = tone === 'emerald';
  return (
    <div
      className={cn(
        'rounded-lg p-4',
        isEmerald ? 'border border-emerald-200 bg-emerald-50' : 'border bg-white',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-bold',
          isEmerald ? 'text-emerald-700' : 'text-muted-foreground',
        )}
      >
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-2 break-words text-4xl font-black leading-tight tabular-nums',
          isEmerald && 'text-emerald-700',
        )}
      >
        {value}
      </p>
    </div>
  );
}
