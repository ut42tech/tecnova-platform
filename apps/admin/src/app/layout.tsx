import type { Metadata } from 'next';
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
