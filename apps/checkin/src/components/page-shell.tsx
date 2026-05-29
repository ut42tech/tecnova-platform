import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';

// 全画面共通のグラデーション地。中央寄せ等は className で上書きする。
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        'flex flex-1 flex-col bg-gradient-to-b from-sky-50 to-white p-4 sm:p-6',
        className,
      )}
    >
      {children}
    </main>
  );
}
