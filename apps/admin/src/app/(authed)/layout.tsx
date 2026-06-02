import { MeGate, MeProvider } from '@tecnova/ui/components/me-provider';
import { Toaster } from '@tecnova/ui/components/sonner';
import { AppShell } from '@/components/app-shell';

// 認証必須セクション全体のレイアウト。MeProvider が /api/me を取得し、
// AppShell（サイドバー等のクローム）は認証解決を待たずに即描画する。
// ページ本文だけ MeGate でゲートする（即時シェル）。/login は別ルートグループ。
// CRUD のフィードバックはここに置いた Toaster でまとめて受ける。
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AppShell>
        <MeGate>{children}</MeGate>
      </AppShell>
      <Toaster richColors position="top-right" />
    </MeProvider>
  );
}
