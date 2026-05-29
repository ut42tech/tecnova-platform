'use client';

import {
  IconChartBar,
  IconChevronDown,
  IconClipboardList,
  IconLayoutDashboard,
  IconLogout,
  IconUserShield,
  IconUsers,
} from '@tabler/icons-react';
import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tecnova/ui/components/dropdown-menu';
import { useMe } from '@tecnova/ui/components/me-provider';
import { Separator } from '@tecnova/ui/components/separator';
import { cn } from '@tecnova/ui/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

interface NavItem {
  href: string;
  label: string;
  Icon: typeof IconLayoutDashboard;
}

interface Props {
  children: React.ReactNode;
}

export function AppShell({ children }: Props) {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.replace('/login');
  };

  const navItems: NavItem[] = [
    { href: '/', label: 'ダッシュボード', Icon: IconLayoutDashboard },
    { href: '/participants', label: '利用者一覧', Icon: IconUsers },
    { href: '/stats', label: '集計', Icon: IconChartBar },
    ...(me.mentor.role === 'admin'
      ? [
          {
            href: '/pre-registrations',
            label: '事前登録管理',
            Icon: IconClipboardList,
          },
          { href: '/mentors', label: '管理者一覧', Icon: IconUserShield },
        ]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <h1 className="text-xl font-bold">テクノバ管理画面</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="gap-2">
              <Badge variant="secondary" className="h-7 font-mono text-[11px]">
                {me.mentor.role}
              </Badge>
              <span className="hidden md:inline">{me.mentor.name}</span>
              <IconChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">管理者名</span>
                  <span className="font-medium text-foreground">{me.mentor.name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Googleアカウント名</span>
                  <span className="text-xs text-foreground">{me.user.name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">メールアドレス</span>
                  <span className="truncate text-xs text-muted-foreground">{me.user.email}</span>
                </div>
                <Badge variant="secondary" className="mt-1 w-fit">
                  {me.mentor.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <IconLogout />
              ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <Separator />
      <nav className="flex flex-wrap gap-2 px-4 py-2 md:px-8">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? 'default' : 'ghost'}
              size="sm"
              className={cn(!active && 'text-muted-foreground')}
            >
              <Link href={item.href}>
                <item.Icon data-icon="inline-start" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <Separator />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
