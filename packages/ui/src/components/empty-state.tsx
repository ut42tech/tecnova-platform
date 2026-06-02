import { cn } from '@tecnova/ui/lib/utils';
import type { ComponentType } from 'react';

interface EmptyStateProps {
  // 任意のアイコン（@tabler/icons-react など className を受け取るコンポーネント）。
  icon?: ComponentType<{ className?: string }>;
  message: string;
  className?: string;
}

// 一覧が空のときの共通プレースホルダ。admin 各画面でインライン重複していた
// 「該当なし」ブロックを 1 箇所に集約する。テーブル内の空行には使わない
// （TableCell/colSpan のままにする）。
export function EmptyState({ icon: Icon, message, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {Icon && <Icon className="size-8" />}
      <span>{message}</span>
    </div>
  );
}
