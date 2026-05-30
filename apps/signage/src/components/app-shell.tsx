'use client';

import { MeProvider } from '@tecnova/ui/components/me-provider';
import { usePathname } from 'next/navigation';

// サイネージは全画面表示なので checkin のようなヘッダ chrome は持たず、MeProvider だけで包む。
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /login は認証ゲートの外（401 時の遷移先）。
  if (pathname.startsWith('/login')) {
    return <>{children}</>;
  }
  return (
    <MeProvider
      forbiddenMessage="サイネージの利用権限がありません"
      loadingClassName="flex min-h-svh items-center justify-center bg-slate-950 text-slate-300"
      forbiddenClassName="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-slate-300"
      errorClassName="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-slate-300"
    >
      {children}
    </MeProvider>
  );
}
