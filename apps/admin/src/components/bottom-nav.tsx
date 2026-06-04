'use client';

import { useMeState } from '@tecnova/ui/components/me-provider';
import { Skeleton } from '@tecnova/ui/components/skeleton';
import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navIndicatorTransition } from '@/lib/motion';
import { isNavItemActive, visibleNavItems } from './nav-items';

// モバイル用のボトムタブバー。画面下に固定し、iPhone のホームインジケータを
// 避けるため safe-area ぶんの余白を足す。ロールに応じて 3〜5 タブを出す。
// 認証解決前はバーの枠だけ即描画し、ロール依存のタブはスケルトンにする（即時シェル）。
export function BottomNav({ className }: { className?: string }) {
  const meState = useMeState();
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();
  const me = meState.status === 'ok' ? meState.me : null;
  const items = me ? visibleNavItems(me.mentor.role) : [];

  return (
    <nav
      aria-label="メインナビゲーション"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
        className,
      )}
    >
      <ul className="flex items-stretch">
        {!me &&
          // ロール未確定（ロード中）はスケルトンのタブを出す。
          [0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex flex-1 flex-col items-center justify-center gap-1 py-2">
              <Skeleton className="size-5 rounded-md" />
              <Skeleton className="h-2 w-8" />
            </li>
          ))}
        {me &&
          items.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
                    // dark の --primary は背景に対してコントラスト不足（2.6:1）なので、
                    // dark では明るい sidebar-primary を使って AA を満たす。
                    active ? 'text-primary dark:text-sidebar-primary' : 'text-muted-foreground',
                  )}
                >
                  {active &&
                    (prefersReduced ? (
                      <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary dark:bg-sidebar-primary" />
                    ) : (
                      <motion.span
                        layoutId="bottomnav-active"
                        transition={navIndicatorTransition}
                        className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary dark:bg-sidebar-primary"
                      />
                    ))}
                  <item.Icon className="size-5" stroke={active ? 2.2 : 1.7} />
                  <span className="leading-none">{item.shortLabel}</span>
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
