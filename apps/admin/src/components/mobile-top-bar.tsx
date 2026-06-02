'use client';

import { useMe } from '@tecnova/ui/components/me-provider';
import { ThemeToggle } from '@tecnova/ui/components/theme-toggle';
import { cn } from '@tecnova/ui/lib/utils';
import { AccountMenu } from './account-menu';

// モバイル用のトップバー。左にブランド、右にテーマ切替とアカウント。
// ページタイトルは各ページの PageHeader が担うのでここでは出さない。
export function MobileTopBar({ className }: { className?: string }) {
  const me = useMe();

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-md',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
          tec
        </span>
        <span className="truncate text-sm font-bold tracking-tight">テクノバ管理画面</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* モバイルはタッチ確保のため 40px のヒットエリアにする。 */}
        <ThemeToggle size="icon-lg" />
        <AccountMenu
          align="end"
          trigger={
            <button
              type="button"
              aria-label="アカウント"
              className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {me.mentor.name.charAt(0)}
            </button>
          }
        />
      </div>
    </header>
  );
}
