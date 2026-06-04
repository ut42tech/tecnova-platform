'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

// アプリ全体のテーマ（light / dark / system）を司る薄いラッパー。
// 既定値（class 属性での切替・system 既定・テーマ変更時のトランジション抑止）を
// ここに集約し、各アプリは <ThemeProvider> で囲むだけでよい。
// next-themes は <html> に .dark / .light を付け替えるので、
// globals.css の .dark トークンがそのまま効く。
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
