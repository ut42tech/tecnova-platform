import { IconClipboardCheck, IconHome } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import Link from 'next/link';
import '@tecnova/ui/globals.css';
import { cn } from '@tecnova/ui/lib/utils';

const fontSans = LINE_Seed_JP({
  variable: '--font-sans',
  weight: ['100', '400', '700', '800'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'うけつけシステム',
  // iOS Safari に PWA 起動を伝える。Web マニフェスト（app/manifest.ts）は
  // Android / Chromium 用、appleWebApp は iOS 用で両方必要。
  appleWebApp: {
    capable: true,
    title: 'うけつけシステム',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  // iPad はランドスケープでも縦持ちでも動かしたいので width=device-width のみ。
  // user-scalable は false にすると入力時のズームが封じられて誤タップが減る。
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={cn('h-full antialiased font-sans', fontSans.variable)}>
      <body className="min-h-full">
        <header className="fixed inset-x-0 top-0 z-50 bg-white shadow-sm">
          <div className="mx-auto flex h-24 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-4">
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
            <Button asChild variant="outline" size="lg" className="h-12 px-5 text-lg">
              <Link href="/">
                <IconHome className="size-6" data-icon="inline-start" />
                ホーム
              </Link>
            </Button>
          </div>
        </header>
        <div className="box-border flex min-h-svh flex-col pt-24">{children}</div>
      </body>
    </html>
  );
}
