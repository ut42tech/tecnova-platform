'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { AIR_STATUS_META, type AirStatus } from '@/lib/broadcast';

// ステータスを示すピル（点＋ラベル）。脈動（ソナー）アニメは見え方が安定しないため廃止し静的にする。
export function LiveBadge({ status, className }: { status: AirStatus; className?: string }) {
  const meta = AIR_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 font-bold whitespace-nowrap',
        meta.chip,
        className,
      )}
    >
      <span className={cn('size-2.5 shrink-0 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
