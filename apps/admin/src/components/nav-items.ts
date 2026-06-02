import {
  IconChartBar,
  IconClipboardList,
  IconLayoutDashboard,
  IconUserShield,
  IconUsers,
} from '@tabler/icons-react';

export interface NavItem {
  href: string;
  /** サイドバー等で使うフルラベル */
  label: string;
  /** ボトムナビ用の短縮ラベル */
  shortLabel: string;
  Icon: typeof IconLayoutDashboard;
  /** admin ロールにのみ表示する項目 */
  adminOnly?: boolean;
}

// サイドバー（デスクトップ）とボトムナビ（モバイル）が共有する唯一の真実の源。
// ここでロール出し分けを一元管理する。
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ダッシュボード', shortLabel: 'ホーム', Icon: IconLayoutDashboard },
  { href: '/participants', label: '利用者一覧', shortLabel: '利用者', Icon: IconUsers },
  { href: '/stats', label: '集計', shortLabel: '集計', Icon: IconChartBar },
  {
    href: '/pre-registrations',
    label: '事前登録管理',
    shortLabel: '事前登録',
    Icon: IconClipboardList,
    adminOnly: true,
  },
  {
    href: '/mentors',
    label: '管理者一覧',
    shortLabel: '管理者',
    Icon: IconUserShield,
    adminOnly: true,
  },
];

// ロールに応じて表示すべきナビ項目を返す。
export const visibleNavItems = (role: 'admin' | 'mentor'): NavItem[] =>
  NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin');

// アクティブ判定。'/' はダッシュボード専用なので前方一致にせず完全一致で見る。
export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};
