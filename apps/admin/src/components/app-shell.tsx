'use client';

import { Badge } from '@tecnova/ui/components/badge';
import { Button } from '@tecnova/ui/components/button';
import { useMe } from '@tecnova/ui/components/me-provider';
import { Separator } from '@tecnova/ui/components/separator';
import { cn } from '@tecnova/ui/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

interface NavItem {
  href: string;
  label: string;
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
    { href: '/', label: 'ダッシュボード' },
    { href: '/participants', label: '参加者一覧' },
    ...(me.mentor.role === 'admin'
      ? [
          { href: '/pre-registrations', label: '事前登録管理' },
          { href: '/mentors', label: 'メンター管理' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-8 py-4">
        <h1 className="text-xl font-bold">テクノバ管理画面</h1>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {me.user.name}
            <Badge variant="secondary">{me.mentor.role}</Badge>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={signOut}>
            ログアウト
          </Button>
        </div>
      </header>
      <Separator />
      <nav className="flex gap-2 px-8 py-2">
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
              <Link href={item.href}>{item.label}</Link>
            </Button>
          );
        })}
      </nav>
      <Separator />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
