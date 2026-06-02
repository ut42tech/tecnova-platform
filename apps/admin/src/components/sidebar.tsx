'use client';

import { IconSelector } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { useMeState } from '@tecnova/ui/components/me-provider';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { ThemeToggle } from '@tecnova/ui/components/theme-toggle';
import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navIndicatorTransition } from '@/lib/motion';
import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';
import { isNavItemActive, visibleNavItems } from './nav-items';

// デスクトップ用の固定左サイドバー。ブランド → ナビ → フッター（テーマ切替 +
// アカウント）の3段構成。モバイルでは AppShell 側で hidden にする。
// 認証解決前（me ロード中）はクロームを即描画し、ロール依存のナビとアカウントだけ
// スケルトンにする（即時シェル）。
export function Sidebar({ className }: { className?: string }) {
  const meState = useMeState();
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();
  const me = meState.status === 'ok' ? meState.me : null;
  const items = me ? visibleNavItems(me.mentor.role) : [];

  return (
    <aside
      className={cn(
        'flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <BrandLogo imgClassName="h-7" priority />
        <span className="truncate text-sm font-semibold tracking-tight text-muted-foreground">
          管理画面
        </span>
      </div>

      <nav aria-label="メインナビゲーション" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {me
          ? items.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <div key={item.href} className="relative">
                  {/* アクティブ表示は塗りつぶしピル。layoutId でタブ間を滑らせる
                      （reduced-motion 時は静的に表示）。
                      ライトの --sidebar-primary は前景白とのコントラストが 3.77:1 で AA 未達のため、
                      ボトムナビと同じく light=primary / dark=sidebar-primary を使う（どちらも AA 達成）。 */}
                  {active &&
                    (prefersReduced ? (
                      <span className="absolute inset-0 rounded-4xl bg-primary dark:bg-sidebar-primary" />
                    ) : (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        transition={navIndicatorTransition}
                        className="absolute inset-0 rounded-4xl bg-primary dark:bg-sidebar-primary"
                      />
                    ))}
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      'relative w-full justify-start gap-3 px-3',
                      active
                        ? 'text-primary-foreground hover:bg-transparent hover:text-primary-foreground dark:text-sidebar-primary-foreground dark:hover:text-sidebar-primary-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    <Link href={item.href} aria-current={active ? 'page' : undefined}>
                      <item.Icon />
                      {item.label}
                    </Link>
                  </Button>
                </div>
              );
            })
          : // ロール未確定（ロード中）はスケルトンのナビ行を出す。
            [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full rounded-4xl" />)}
      </nav>

      <div className="flex items-center gap-1 border-t p-3">
        {me ? (
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
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          </div>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}
