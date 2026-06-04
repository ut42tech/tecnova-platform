'use client';

import { IconLogout } from '@tabler/icons-react';
import { Badge } from '@tecnova/ui/components/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tecnova/ui/components/dropdown-menu';
import { useMe } from '@tecnova/ui/components/me-provider';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

interface Props {
  /** ドロップダウンを開くトリガー要素（サイドバー / トップバーで見た目が異なる） */
  trigger: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

// 管理者情報（氏名・ロール・Google アカウント・メール）とログアウトをまとめた
// アカウントメニュー。サイドバーのフッターとモバイルのトップバーで共有する。
export function AccountMenu({ trigger, align = 'end', side }: Props) {
  const me = useMe();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="min-w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">管理者名</span>
              <span className="font-medium text-foreground">{me.mentor.name}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Googleアカウント名</span>
              <span className="text-xs text-foreground">{me.user.name}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">メールアドレス</span>
              <span className="truncate text-xs text-muted-foreground">{me.user.email}</span>
            </div>
            <Badge variant="secondary" className="mt-1 w-fit">
              {me.mentor.role}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <IconLogout />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
