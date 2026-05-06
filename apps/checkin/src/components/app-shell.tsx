'use client';

import { IconClipboardCheck, IconHome, IconSettings } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MeProvider } from '@/lib/me-context';

interface Props {
  children: React.ReactNode;
}

export function AppShell({ children }: Props) {
  const pathname = usePathname();
  const isLoginRoute = pathname.startsWith('/login');

  if (isLoginRoute) {
    return <Chrome>{children}</Chrome>;
  }

  return (
    <MeProvider>
      <Chrome actions={<AuthedActions />}>{children}</Chrome>
    </MeProvider>
  );
}

function Chrome({ children, actions }: Props & { actions?: React.ReactNode }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 bg-white shadow-sm">
        <div className="mx-auto flex h-24 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"
            >
              <IconClipboardCheck className="size-8" />
            </span>
            <span className="truncate text-3xl font-black tracking-normal sm:text-4xl">
              うけつけシステム
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <Button asChild variant="outline" size="lg" className="h-12 px-5 text-lg">
              <Link href="/">
                <IconHome className="size-6" data-icon="inline-start" />
                ホーム
              </Link>
            </Button>
            {actions}
            <span aria-hidden="true" className="hidden h-10 w-px shrink-0 bg-slate-200 sm:block" />
            <Image
              src="/logo_tecnova.png"
              alt="TECNOVA"
              width={153}
              height={40}
              priority
              className="hidden h-8 w-auto shrink-0 sm:block md:h-10"
            />
          </div>
        </div>
      </header>
      <div className="box-border flex min-h-svh flex-col pt-24">{children}</div>
    </>
  );
}

function AuthedActions() {
  const pathname = usePathname();
  const active = pathname.startsWith('/settings');

  return (
    <Button
      asChild
      variant={active ? 'default' : 'outline'}
      size="lg"
      className="h-12 px-5 text-lg"
    >
      <Link href="/settings">
        <IconSettings className="size-6" data-icon="inline-start" />
        設定
      </Link>
    </Button>
  );
}
