'use client';

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader,
} from '@tabler/icons-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// アクティブなテーマに追従させる。ThemeProvider をツリーに持たないアプリ
// （checkin / signage）では resolvedTheme が undefined になるため light に
// フォールバックし、従来どおりの表示を保つ。
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const theme = (resolvedTheme ?? 'light') as ToasterProps['theme'];
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <IconCircleCheck className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
        error: <IconAlertOctagon className="size-4" />,
        loading: <IconLoader className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
