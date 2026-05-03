'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useMe } from '@/lib/me-context';

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
    ...(me.mentor.role === 'admin' ? [{ href: '/mentors', label: 'メンター管理' }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-8 py-4">
        <h1 className="text-xl font-bold">テクノバ管理画面</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-600">
            {me.user.name} ({me.mentor.role})
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
          >
            ログアウト
          </button>
        </div>
      </header>
      <nav className="flex gap-2 border-b border-zinc-200 px-8 py-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1 text-sm ${
                active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
