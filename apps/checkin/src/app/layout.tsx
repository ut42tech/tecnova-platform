import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テクノバながさき チェックイン',
  // iOS Safari に PWA 起動を伝える。Web マニフェスト（app/manifest.ts）は
  // Android / Chromium 用、appleWebApp は iOS 用で両方必要。
  appleWebApp: {
    capable: true,
    title: 'テクノバ',
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
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
