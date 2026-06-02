'use client';

import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@tecnova/ui/components/dropdown-menu';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const OPTIONS = [
  { value: 'light', label: 'ライト', Icon: IconSun },
  { value: 'dark', label: 'ダーク', Icon: IconMoon },
  { value: 'system', label: 'システム', Icon: IconDeviceDesktop },
] as const;

interface Props {
  className?: string;
  align?: 'start' | 'center' | 'end';
  // トリガーボタンのサイズ。モバイルではタッチ確保のため大きめを渡す。
  size?: 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg';
}

// light / dark / system を選べるテーマ切替。
// next-themes はサーバ描画時にテーマが未確定なので、マウント後にだけ
// 実際のアイコン・選択状態を出してハイドレーション不整合を避ける。
export function ThemeToggle({ className, align = 'end', size = 'icon-sm' }: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ActiveIcon = !mounted
    ? IconSun
    : theme === 'system'
      ? IconDeviceDesktop
      : resolvedTheme === 'dark'
        ? IconMoon
        : IconSun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          className={className}
          aria-label="テーマを切り替える"
        >
          <ActiveIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
