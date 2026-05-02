# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際に参照する指示書です。
作業開始前に必ず本書全体を確認してください。

---

## プロジェクト概要

**tecnova-platform** は長崎大学NUTICで開催される子ども向けファブリケーション活動「テクノバながさき」の運営基盤プラットフォームです。
モノレポ構成で、APIサーバ（Hono on Cloudflare Workers）と複数のフロントエンド（Next.js）を含みます。

詳細な要件・設計は以下を参照してください。**実装前に必ず読むこと**：

- 📘 [`docs/requirements.md`](./docs/requirements.md) — 全体構想・設計判断の根拠
- 📗 [`docs/mvp.md`](./docs/mvp.md) — 実装ガイド（実装に直結する詳細仕様）

---

## 作業前の必須チェックリスト

タスクに着手する前に：

1. ✅ `docs/mvp.md` の関連セクションを読んだか
2. ✅ 該当する実装が「Phase 1（MVP）」のスコープに含まれるか確認したか
3. ✅ 既存コードのパターンを確認したか
4. ✅ 「重要な制約」セクション（後述）を理解したか

---

## ディレクトリ規約

```
tecnova-platform/
├── apps/                # エンドユーザー向けアプリ
│   ├── api/             # Hono on Cloudflare Workers
│   ├── checkin/         # Next.js iPad PWA
│   ├── mentor/          # Next.js スマホPWA (Phase 1.5)
│   └── admin/           # Next.js 管理PC画面
├── packages/            # アプリ間で共有するライブラリ
│   ├── db/              # Drizzle schema・migrations
│   ├── shared/          # 共通型・Zodスキーマ・Sheets連携
│   ├── ui/              # 共通UIコンポーネント (shadcn/ui)
│   └── auth/            # Better Auth設定
└── docs/                # 設計ドキュメント
```

**新しい機能の追加先を判断する基準：**

- 単一アプリ固有 → 該当 `apps/*`
- 複数アプリで使う → `packages/*` のいずれか
- DB関連 → `packages/db`
- 型定義・Zodスキーマ・外部API連携 → `packages/shared`

---

## コーディング規約

### TypeScript

- TypeScript strict mode を有効に
- `any` 型の使用は禁止（やむを得ない場合は `unknown` + 型ガード）
- 関数は arrow function で統一（クラスメソッド・ジェネレータを除く）
- import文はファイルの先頭にまとめる
- 型定義（type/interface）は使用箇所の近くに配置するか、`packages/shared/src/types/` に集約

### ファイル命名

- ファイル名: `kebab-case.ts`（コンポーネントは `PascalCase.tsx`）
- React component: 1ファイル1コンポーネント
- ディレクトリ: `kebab-case`

### コメント

- 日本語コメントOK（チーム言語が日本語）
- 「なぜそうするか」を書く。「何をしているか」はコードで表現する
- TODO/FIXMEには必ず文脈を残す（例: `// TODO(activate-flow): スプシ書き戻し失敗時のリトライキュー対応`）

### スタイル

- Biome で lint + format
- インデント: スペース2つ
- セミコロン: 使用する
- クォート: シングルクォート
- 行末の余分な空白なし

### Git コミット

- コミットメッセージは英語推奨（OSS化を意識）
- 形式: `<type>: <subject>` （例: `feat: add checkin endpoint`）
- type: `feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `style`

---

## 重要な制約（必ず守ること）

### 1. Cloudflare Workers環境の制約

APIサーバ（`apps/api`）は Cloudflare Workers で動作します。以下を厳守：

- ❌ **Node.js 専用APIを使わない**（`fs`, `path`, `child_process`, `process.env` の直接参照）
- ❌ **`googleapis` パッケージを使わない**（Node.js依存のためWorkers非対応）
- ✅ **Web Standard APIを使う**（`fetch`, `crypto.subtle`, `URL`, `TextEncoder` など）
- ✅ 環境変数は `c.env.<NAME>` でアクセス（Hono context経由）
- ✅ 重い処理は `c.executionCtx.waitUntil()` でバックグラウンド実行

### 2. Better Auth on Workers の落とし穴

- ✅ リクエスト毎に auth instance を生成する（middleware内で）
- ✅ `ctx.waitUntil()` を必ず使う（レスポンス送信後のバックグラウンドタスク完了のため）
- ❌ グローバルスコープに auth instance を保持しない（接続ロックの問題）

詳細: [`docs/mvp.md` 11.1節](./docs/mvp.md#111-better-auth-on-workers-でハマったら)

### 3. Google Sheets API の実装方針

- ✅ Web Crypto API で自前JWT生成 + fetch直叩き
- ✅ アクセストークンは1時間有効、モジュールスコープでキャッシュ
- ❌ `googleapis` パッケージは使わない

実装サンプル: [`docs/mvp.md` 5.4節](./docs/mvp.md#54-workers環境でのgoogle-sheets-api実装)

### 4. データ整合性（D1 saga パターン）

DBは Cloudflare D1（SQLite）。インタラクティブ・トランザクションが使えないため、アクティベート処理は補償処理ベースで実装：

1. ID採番（`SELECT` で直近IDを取得 → 計算）
2. event_id を get-or-create
3. **`db.batch([...])` で原子的に**: `INSERT participants` + `INSERT sessions`
4. スプシ書き戻し
5. **失敗時の補償**: `db.batch([...])` で `DELETE sessions` → `DELETE participants` を実行
6. PK衝突時はステップ1からリトライ（最大3回）

詳細: [`docs/mvp.md` 6.1節](./docs/mvp.md#61-認証なしチェックインipad用) の `/checkin/activate` 処理順

### 5. 個人情報の取り扱い

- 内製DBには **本名・住所・年齢・保護者連絡先・学校名は保持しない**
- これらは教員側の管理スプシで完結する設計
- ニックネーム・学年のみが学生側で扱える情報

### 6. タイムゾーン

- DBはUTCで保存（D1/SQLite では `integer({ mode: 'timestamp_ms' })` = Unix epoch ms）
- 「今日」を判定する場合は明示的にJST変換: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })`
- フロント表示時は `Asia/Tokyo` で表示

### 7. Public リポジトリ運用

このリポジトリはPublicです。以下を絶対にコミットしないでください：

- ❌ `.env`, `.env.local`, `.dev.vars`, `.dev.vars.production`
- ❌ サービスアカウントJSON鍵
- ❌ OAuth Client Secret
- ❌ Better Auth Secret
- ❌ D1 database_id（`wrangler.toml` にコミットされる場合は public でも閲覧可能だが、念のため。本番デプロイ用は別管理推奨）
- ❌ 学生側スプシのID（公開しても直接アクセスはできないが念のため秘匿）
- ❌ 実在する子ども・保護者・メンターの個人情報（テストデータも含めない）
- ❌ 本番ドメイン名

シークレット情報は `wrangler secret put` または Vercel環境変数で管理します。
`.env.example` には変数名のみ記載してください。

---

## 実装フローの推奨順序

新機能を実装する際の推奨順序：

1. **`docs/mvp.md` の該当セクションを読む**
2. **型を定義する**（`packages/shared/src/types/` または該当アプリ内）
3. **Zodスキーマを定義する**（`packages/shared/src/schemas/`）
4. **DB操作が必要なら**、`packages/db` のスキーマを確認・更新
5. **APIエンドポイントを実装**（`apps/api`）
6. **フロント側で呼び出し**（Hono Client `hc` を使うことで型推論が効く）
7. **動作確認**してから次へ

---

## よく使うコマンド

```bash
# 開発サーバ起動（全アプリ）
pnpm dev

# 特定アプリのみ起動
pnpm --filter @tecnova/api dev
pnpm --filter @tecnova/checkin dev
pnpm --filter @tecnova/admin dev

# Lint & format
pnpm biome check --write .

# 型チェック
pnpm type-check

# DB マイグレーション生成（drizzle-kit が SQL を packages/db/drizzle/ に出力）
pnpm --filter @tecnova/db db:generate

# DB マイグレーション適用（ローカル D1 / 本番 D1）
cd apps/api
npx wrangler d1 migrations apply tecnova-db --local
npx wrangler d1 migrations apply tecnova-db --remote

# Cloudflare Workers デプロイ
pnpm --filter @tecnova/api deploy

# シークレット設定
cd apps/api
npx wrangler secret put <SECRET_NAME>
```

---

## 設計判断時の参照先

実装中に「これってどう設計するんだっけ？」となったら：

| 疑問                           | 参照先                             |
| ------------------------------ | ---------------------------------- |
| なぜこの技術スタックなのか     | `docs/requirements.md` 10章        |
| なぜこのデータモデルなのか     | `docs/requirements.md` 5章 + 付録A |
| APIのリクエスト/レスポンス形式 | `docs/mvp.md` 6章                  |
| 画面遷移・UI仕様               | `docs/mvp.md` 7章                  |
| 既知のリスク・対策             | `docs/requirements.md` 12章        |
| トラブルシュート               | `docs/mvp.md` 11章                 |
| 設計判断の根拠                 | `docs/requirements.md` 付録A       |

判断に迷うことがあれば、まず上記を確認してから提案・実装してください。

---

## このドキュメントの更新

仕様変更や新しい制約が判明した場合：

1. まず `docs/requirements.md` または `docs/mvp.md` を更新
2. 必要に応じて本書（`CLAUDE.md`）を更新
3. その後にコード変更を行う

**ドキュメント先行の原則**を守ることで、後から見たときに「なぜこの実装なのか」が辿れる状態を保ちます。
