'use client';

import { useMeState } from '@tecnova/ui/components/me-provider';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { ThemeToggle } from '@tecnova/ui/components/theme-toggle';
import { cn } from '@tecnova/ui/lib/utils';
import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';

// モバイル用のトップバー。左にブランド、右にテーマ切替とアカウント。
// ページタイトルは各ページの PageHeader が担うのでここでは出さない。
// 認証解決前はブランド/テーマ切替を即描画し、アカウントだけスケルトンにする。
export function MobileTopBar({ className }: { className?: string }) {
  const meState = useMeState();
  const me = meState.status === 'ok' ? meState.me : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-md',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <BrandLogo imgClassName="h-6" priority />
        <span className="truncate text-sm font-semibold tracking-tight text-muted-foreground">
          管理画面
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* モバイルはタッチ確保のため 40px のヒットエリアにする。 */}
        <ThemeToggle size="icon-lg" />
        {me ? (
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
        ) : (
          <Skeleton className="size-10 rounded-full" />
        )}
      </div>
    </header>
  );
}
