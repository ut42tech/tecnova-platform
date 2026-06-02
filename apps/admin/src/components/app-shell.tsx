'use client';

import { BottomNav } from './bottom-nav';
import { MobileTopBar } from './mobile-top-bar';
import { Sidebar } from './sidebar';

interface Props {
  children: React.ReactNode;
}

// 認証必須セクションのレイアウトシェル。
// - デスクトップ(md+): 固定サイドバー + 本文
// - モバイル: 上にトップバー、下にボトムタブバー、その間に本文
// 本文はボトムナビ + safe-area ぶん下に余白を取り、最後の要素が隠れないようにする。
export function AppShell({ children }: Props) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar className="hidden md:sticky md:top-0 md:flex md:h-svh" />
      {/* 各ページが自前の <main> を持つので、ここはラッパ div に留める（main の入れ子回避）。
          モバイルではボトムナビ + safe-area ぶん下に余白を取り、最後の要素が隠れないようにする。 */}
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <MobileTopBar className="md:hidden" />
        {children}
      </div>
      <BottomNav className="md:hidden" />
    </div>
  );
}
