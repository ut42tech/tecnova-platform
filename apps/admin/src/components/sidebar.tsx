'use client';

import { IconSelector } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { useMe } from '@tecnova/ui/components/me-provider';
import { ThemeToggle } from '@tecnova/ui/components/theme-toggle';
import { cn } from '@tecnova/ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from './account-menu';
import { isNavItemActive, visibleNavItems } from './nav-items';

// デスクトップ用の固定左サイドバー。ブランド → ナビ → フッター（テーマ切替 +
// アカウント）の3段構成。モバイルでは AppShell 側で hidden にする。
export function Sidebar({ className }: { className?: string }) {
  const me = useMe();
  const pathname = usePathname();
  const items = visibleNavItems(me.mentor.role);

  return (
    <aside
      className={cn(
        'flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-[11px] font-bold tracking-tight text-primary-foreground">
          tec
        </span>
        <span className="truncate text-base font-bold tracking-tight">テクノバ管理画面</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 px-3',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <Link href={item.href}>
                <item.Icon />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="flex items-center gap-1 border-t p-3">
        <AccountMenu
          align="start"
          side="top"
          trigger={
            <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-2.5 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {me.mentor.name.charAt(0)}
              </span>
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="max-w-full truncate text-sm font-medium text-foreground">
                  {me.mentor.name}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {me.mentor.role}
                </span>
              </span>
              <IconSelector className="ml-auto text-muted-foreground" data-icon="inline-end" />
            </Button>
          }
        />
        <ThemeToggle />
      </div>
    </aside>
  );
}
