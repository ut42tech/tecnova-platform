import { MeProvider } from '@tecnova/ui/components/me-provider';
import { AppShell } from '@/components/app-shell';

// 認証必須セクション全体のレイアウト。MeProvider が /api/me を取得し、
// AppShell が共通ヘッダーとナビを描画する。/login は別ルートグループなので
// このレイアウトは適用されない。
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
