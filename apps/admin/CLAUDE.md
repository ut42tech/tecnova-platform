@AGENTS.md

# admin（管理画面 / PC・モバイル）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、上記 AGENTS.md の通り実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3001`（`next dev --port 3001`）。api は `8787`、checkin は `3000`。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時は `http://localhost:8787` にフォールバック）。サンプルはリポジトリ root の `.env.example` を参照（ローカルは `.env.local` にコピー）。本番は Vercel 環境変数で設定。
- **新しい `@tecnova/*` パッケージを使うとき**: `next.config.ts` の `transpilePackages`（現状 `@tecnova/shared`, `@tecnova/ui`）に追加しないと ESM ビルドが壊れる。
- 認証は `(authed)/layout.tsx` で `MeProvider` をラップする構成。API 呼び出しは `@tecnova/ui` の `apiFetch`、ユーザー情報は `useMe()` を使う。
- **レスポンシブ / ナビ**: `AppShell` がデスクトップ=固定サイドバー、モバイル=トップバー + ボトムタブで出し分ける。ナビ項目は `src/components/nav-items.ts` を唯一の真実の源とし、ロールで出し分ける。広いテーブルは `md` 未満で `RecordCard` のカード一覧に切り替える（`hidden md:block` ↔ `md:hidden`）。
- **ダークモード**: `@tecnova/ui` の `ThemeProvider`（next-themes）を `layout.tsx` でラップする。`<html suppressHydrationWarning>` が必須。切替 UI は `ThemeToggle`、トースト（`Toaster`）はテーマに追従する。
- **PWA は iOS/Android 二重設定**（checkin と同様）: iOS は `src/app/layout.tsx` の `appleWebApp`、Android/Chromium は `src/app/manifest.ts`。アイコンは `src/app/icon.tsx` / `apple-icon.tsx` で生成（PNG は置かない）。**ただし checkin と違いズームは許可**（管理画面はアクセシビリティ重視のため `viewport` で `maximumScale`/`userScalable` を制限しない）。
