import type { Metadata } from 'next';
import { Geist_Mono, Noto_Sans } from 'next/font/google';
import '@tecnova/ui/globals.css';
import { cn } from '@tecnova/ui/lib/utils';

const fontSans = Noto_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
});

const fontMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テクノバ管理画面',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={cn('h-full antialiased font-sans', fontSans.variable, fontMono.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
