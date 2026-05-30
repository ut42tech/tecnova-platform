import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import '@tecnova/ui/globals.css';
import { cn } from '@tecnova/ui/lib/utils';
import { AppShell } from '@/components/app-shell';

const fontSans = LINE_Seed_JP({
  variable: '--font-sans',
  weight: ['100', '400', '700', '800'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テクノバ サイネージ',
  // iOS Safari に PWA 起動を伝える。Android/Chromium 用の Web マニフェスト
  // （app/manifest.ts）と両方必要。
  appleWebApp: { capable: true, title: 'サイネージ', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  // 配信レイアウトの地（sky-50）に合わせる。
  themeColor: '#f0f9ff',
  // 大型モニターのキオスク表示。ピンチズーム無効で誤操作を防ぐ。
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={cn('h-full antialiased font-sans', fontSans.variable)}>
      <body className="min-h-full bg-sky-50">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
