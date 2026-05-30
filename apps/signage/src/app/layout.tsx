import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import '@tecnova/ui/globals.css';
import { cn } from '@tecnova/ui/lib/utils';

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
  themeColor: '#020617',
  // 大型モニターのキオスク表示。ピンチズーム無効で誤操作を防ぐ。
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={cn('h-full antialiased font-sans', fontSans.variable)}>
      <body className="min-h-full bg-slate-950">{children}</body>
    </html>
  );
}
