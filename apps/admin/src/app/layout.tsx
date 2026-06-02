import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import '@tecnova/ui/globals.css';
import { ThemeProvider } from '@tecnova/ui/components/theme-provider';
import { cn } from '@tecnova/ui/lib/utils';

const fontSans = LINE_Seed_JP({
  variable: '--font-sans',
  weight: ['100', '400', '700', '800'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テクノバ管理画面',
  // iOS Safari に PWA 起動を伝える（Android / Chromium 用は app/manifest.ts）。両方必要。
  appleWebApp: {
    capable: true,
    title: 'テクノバ管理画面',
    // 上部にトップバーがあるため content を status bar 下に収める 'default' を使う
    // （checkin の 'black-translucent' はキオスク用途）。
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  // PWA のステータスバー色をテーマに追従させる（light: 背景白 / dark: 背景黒）。
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  // 管理画面はアクセシビリティ重視。checkin と違いズームは制限しない。
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes が <html> に .dark / .light を付け替えるため suppressHydrationWarning が必要。
    <html
      lang="ja"
      suppressHydrationWarning
      className={cn('h-full antialiased font-sans', fontSans.variable)}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
