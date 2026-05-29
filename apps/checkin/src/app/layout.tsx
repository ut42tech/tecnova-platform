import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import '@tecnova/ui/globals.css';
import './view-transitions.css';
import { cn } from '@tecnova/ui/lib/utils';
import { AppShell } from '@/components/app-shell';

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
