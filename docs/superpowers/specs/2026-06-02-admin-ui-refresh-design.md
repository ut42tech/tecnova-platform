# 管理画面 UI リフレッシュ設計（レスポンシブ + PWA + ダークモード）

- 日付: 2026-06-02
- 対象アプリ: `apps/admin`（Next.js 16 / React 19、ポート 3001）
- 関連共有パッケージ: `packages/ui`（`@tecnova/ui`）

## 1. 目的

管理画面（admin）を **デスクトップ前提のレイアウトから、モバイルファーストのレスポンシブ UI** に作り直す。
あわせて以下を達成する:

1. スマホ〜タブレット〜デスクトップで破綻なく使えるレスポンシブ対応
2. モバイルでホーム画面に追加できる **インストール可能な PWA** 化（checkin と同方針）
3. ブランド・フォントは維持したままの **洗練された見た目・UX のブラッシュアップ**
4. **ダークモード**（system + 手動トグル、永続化）の導入と Toaster のテーマ追従

## 2. 決定事項（ブレインストーミングで合意済み）

| 項目             | 決定                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| ナビゲーション   | デスクトップ = 左サイドバー / モバイル・PWA = ボトムタブバー         |
| リフレッシュ範囲 | Refined polish pass（既存トークン・LINE Seed JP を維持した磨き込み） |
| PWA              | checkin と同方針（インストール可能・standalone 表示、オフラインなし）|
| ダークモード     | トグルを追加（system + 手動、永続化、Sonner をテーマ追従に修正）     |

## 3. アプローチ

`@tecnova/ui` には現状 `Sidebar` プリミティブが無い。shadcn の `Sidebar` はモバイルで
**Sheet ドロワー**に畳まれる挙動で、今回選択した「ボトムタブバー」と矛盾する。
そのため shadcn Sidebar は導入せず、**既存プリミティブから軽量なカスタムシェルを自作**する。

テーマ基盤は admin 固有ではなく **共有 `@tecnova/ui` に置く**。理由は `Toaster`（Sonner）が
`@tecnova/ui` 側にあり、テーマ追従させるには同じ next-themes コンテキストが必要なため。
共有化により将来他アプリでもダークモードを再利用できる。ただし **既存の checkin / signage が
ThemeProvider を持たなくても従来どおり light 表示になる**ことを保証する（後述）。

## 4. ナビゲーションシェル設計

`apps/admin/src/components/app-shell.tsx` を作り直し、ナビ定義を単一の真実の源に集約する。

### 4.1 nav-items（単一の真実の源）

- 新規 `apps/admin/src/components/nav-items.ts`
- 形: `{ href, label, shortLabel, icon, adminOnly }[]`
- ロールによる出し分け（`adminOnly`）はここ 1 箇所に集約し、Sidebar と BottomNav が同じ配列を消費する
- 項目: ダッシュボード / 参加者 / 統計（全ロール）、事前登録・メンター（admin のみ）

### 4.2 Sidebar（デスクトップ、`hidden md:flex`）

- 固定幅 ~240px の左レール（折りたたみトグルは作らない = YAGNI）
- 構成: ブランド → ナビリスト（アクティブ状態強調）→ フッター（**ThemeToggle + アカウントドロップダウン**: 氏名・ロールバッジ・email・ログアウト）
- アクティブ判定は `usePathname()`

### 4.3 MobileTopBar（`md:hidden`）

- コンパクトなトップバー: 左に現在ページのタイトル、右にアカウントアバター
- アバター押下で메뉴（ロール表示 / ログアウト / ThemeToggle）

### 4.4 BottomNav（`md:hidden`）

- 画面下固定のタブバー、ロールでフィルタ（mentor=3 / admin=5 タブ）
- アイコン + 極小ラベル（`shortLabel`）、アクティブインジケータ
- **`env(safe-area-inset-bottom)`** ぶんの下パディングで iPhone のホームインジケータを回避
- タッチターゲット ≥44px
- 5 が快適な上限。将来ナビが 5 を超えたら "More" シートに溢れ分を逃がす（**今回は作らない**・将来課題として明記）

### 4.5 AppShell（オーケストレーション）

- デスクトップ: サイドバー幅ぶんのオフセット
- モバイル: `<main>` 下端にボトムナビの高さ + safe-area ぶんのオフセット
- `Sidebar` / `MobileTopBar` / `BottomNav` をブレークポイントで出し分け

## 5. テーマ基盤（共有 `@tecnova/ui`）

- 新規 `packages/ui/src/components/theme-provider.tsx`
  - `next-themes` の薄いラッパー: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`
- 新規 `packages/ui/src/components/theme-toggle.tsx`
  - light / dark / system を循環するボタン（Tabler `IconSun` / `IconMoon` / `IconDeviceDesktop`）
  - ハイドレーション不整合を避けるため mounted 後に描画する next-themes 標準パターン
- 既存 `packages/ui/src/components/sonner.tsx` を修正
  - `useTheme().resolvedTheme` を読み、**`undefined` の場合は `'light'` にフォールバック**
  - これにより ThemeProvider を持たない checkin / signage は**従来どおり light のまま**（視覚的変更なし）
  - 既存コメント（「管理画面はテーマ切替を持たないので light 固定」）を実態に合わせて更新
- `packages/ui/package.json` に `next-themes` を依存追加（admin は `@tecnova/ui` 経由で利用、直接依存は不要）
- admin ルートレイアウトを `ThemeProvider` でラップし、`<html suppressHydrationWarning>` を付与（next-themes 要件）
- 色は `globals.css` の既存 `.dark` トークンを使用 — **トークンの追加・変更はしない**

## 6. PWA（admin、checkin の二重設定をミラー）

- 新規 `apps/admin/src/app/manifest.ts`
  - `display: 'standalone'`、ブランドカラー、`lang: 'ja'`
  - **orientation は固定しない**（admin はキオスクではなく回転自由にする。checkin の portrait 固定とは異なる）
  - `name: 'テクノバ管理画面'` / `short_name: '管理画面'`
- 既存 `apps/admin/src/app/layout.tsx` を修正
  - `appleWebApp`（iOS）メタデータを追加
  - `viewport` を export。`themeColor` は **light/dark のメディアクエリ配列**にして PWA ステータスバーをテーマに追従
  - **ユーザーズームは許可**（`maximumScale` / `userScalable:false` を設定しない）。admin はアクセシビリティ重視のツールでありキオスクではない
- アイコン: admin/public にロゴ資産が無いため **プログラム生成**する
  - `apps/admin/src/app/icon.tsx`（192/512）+ `apps/admin/src/app/apple-icon.tsx`（180）を `ImageResponse` で生成（ブランドブルー地のタイポグラフィックマーク）
  - **バイナリ資産はコミットしない**。プラットフォームの既存方針（checkin のコメント）とも一致
  - manifest の `icons` は生成アイコンの URL を参照

## 7. ページ別レスポンシブ対応

- **広いテーブルはモバイルでカード化**: ダッシュボードのセッション、参加者一覧、メンター一覧は `<md` でカードの縦積み、`≥md` でテーブル表示に切替
  - 統計テーブル（日付 + 各時間帯のカウント）は横幅が狭いので横スクロールで可
- **PageHeader**: モバイルでタイトル / 説明 / アクションを縦積みに（`apps/admin/src/components/page-header.tsx`）
- **フォーム**（メンター作成 / 事前登録作成）: モバイルで 1 カラム化
  - 入力欄は既に `text-base`(16px) なので **iOS の自動ズームは発生しない**。これを維持する（`text-base` を消さない）
- **詳細 Sheet**: モバイルで全幅（`w-full sm:max-w-md`）（`apps/admin/src/components/participant-detail-sheet.tsx`）
- **ログイン**: 仕上げ + ダークモード対応（`apps/admin/src/app/login/page.tsx`）
- 余白リズム・密度・空状態 / ローディング / エラー状態・focus/hover のマイクロインタラクションを全体調整。**新色は追加しない**

## 8. データフロー・エラー処理（変更なし）

- データ取得（`apiFetch` / `apiJson`）、`MeProvider`、認証、API は一切変更しない
- ナビのロール出し分けは `useMe().mentor.role` を参照
- テーマはクライアント専用コンテキスト。新たなエラー経路は無し
- 既存の discriminated-union（loading / ok / error）パターンを踏襲

## 9. テスト・検証

admin にはフロントのテストランナーが存在しない（root / admin / ui いずれにも vitest/jest/playwright/testing-library なし）。
視覚・レスポンシブ作業は TDD に不向きなため、検証は以下で行う:

1. `pnpm type-check` がクリーン
2. `pnpm biome check` がクリーン
3. **Playwright（MCP 利用可）** で dev サーバを開き、**375 / 768 / 1280px × light/dark** のスクリーンショットを取得
   - ボトムナビ ↔ サイドバーがブレークポイントで切り替わること
   - ダークモードのトグル動作・永続化
4. `/manifest.webmanifest` を取得して PWA マニフェストの妥当性を確認
5. checkin / signage の Toaster が従来どおり light 表示であること（リグレッション確認）

## 10. スコープ境界（YAGNI）

含めない:

- オフライン対応 / Service Worker
- サイドバーの折りたたみトグル
- API / バックエンドの変更
- 大胆なリブランド（新パレット等）
- ナビ基盤の他アプリへの横展開（今回は admin のみ。テーマ基盤のみ共有 ui に置く）

## 11. 影響を受けるファイル一覧

### 新規作成

- `apps/admin/src/components/nav-items.ts`
- `apps/admin/src/components/sidebar.tsx`
- `apps/admin/src/components/mobile-top-bar.tsx`
- `apps/admin/src/components/bottom-nav.tsx`
- `apps/admin/src/app/manifest.ts`
- `apps/admin/src/app/icon.tsx`
- `apps/admin/src/app/apple-icon.tsx`
- `packages/ui/src/components/theme-provider.tsx`
- `packages/ui/src/components/theme-toggle.tsx`

### 修正

- `apps/admin/src/components/app-shell.tsx`（作り直し）
- `apps/admin/src/app/layout.tsx`（ThemeProvider / viewport / appleWebApp / suppressHydrationWarning）
- `apps/admin/src/app/(authed)/layout.tsx`（新 AppShell 配線）
- `apps/admin/src/app/(authed)/page.tsx`（ダッシュボード: テーブル→カード）
- `apps/admin/src/app/(authed)/participants/page.tsx`
- `apps/admin/src/app/(authed)/stats/page.tsx`
- `apps/admin/src/app/(authed)/mentors/page.tsx`
- `apps/admin/src/app/(authed)/pre-registrations/page.tsx`
- `apps/admin/src/app/login/page.tsx`
- `apps/admin/src/components/page-header.tsx`
- `apps/admin/src/components/participant-detail-sheet.tsx`
- `packages/ui/src/components/sonner.tsx`（テーマ追従 + light フォールバック）
- `packages/ui/package.json`（`next-themes` 追加）

## 12. 検証チェックリスト

- [ ] `pnpm type-check` がクリーン
- [ ] `pnpm biome check` がクリーン
- [ ] 375 / 768 / 1280px で破綻なく表示（Playwright スクショ）
- [ ] モバイルでボトムタブ、デスクトップでサイドバーが表示される
- [ ] ダークモード切替が機能し、リロード後も保持される
- [ ] iOS safe-area でボトムナビがホームインジケータに被らない
- [ ] `/manifest.webmanifest` が妥当（name / display / icons）
- [ ] iOS（appleWebApp）・Android（manifest）双方の PWA メタが入っている
- [ ] checkin / signage の Toaster が従来どおり light のまま（リグレッションなし）
- [ ] admin にロールごとのナビ出し分け（mentor=3 / admin=5）が反映される
