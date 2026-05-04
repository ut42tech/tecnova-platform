# tecnova-platform

**長崎大学NUTICで開催される子ども向けファブリケーション活動「テクノバながさき」の運営基盤プラットフォーム。**

参加者のチェックイン/アウト、活動ログ記録、研究データ収集を統合的に支える内製システム。API-firstなアーキテクチャで、複数のクライアント（iPadチェックイン機・メンタースマホ・管理PC）を同一バックエンドから提供する。

---

## ✨ Features

### Phase 1（MVP）

- 📱 **iPad PWAチェックインシステム** — QR/バーコードでワンタップ入退場
- 🆕 **「初めての方」フロー** — 事前登録情報から本人選択→自動採番→アクティベート
- 🔗 **Google Sheets双方向連携** — 教員側のプライバシー要件に配慮した分離設計
- 🔐 **Google OAuth + 許可リスト認証** — 運営者管理のシンプル化
- 📊 **管理ダッシュボード** — 当日の来場状況をリアルタイム把握

### Phase 1.5（運用開始後実装）

- 📝 メンタースマホアプリ（30分グリッドのログ記入・未記入ハイライト）
- 🏷️ 活動カテゴリ・機材マスタ管理
- 📤 ログCSVエクスポート

### Phase 2（中長期）

- 🔍 振り返りシートのVision LLM経由OCR取り込み
- 🌐 公開API（混雑状況配信）
- 📈 分析ダッシュボード（クラスター分析支援）

---

## 🏗️ Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Checkin (iPad) │  │ Mentor (Mobile) │  │  Admin (PC)     │
│  Next.js PWA    │  │  Next.js PWA    │  │  Next.js        │
│  on Vercel      │  │  on Vercel      │  │  on Vercel      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │ REST + Hono Client (type-safe)
                              ▼
                    ┌──────────────────┐
                    │  Hono API        │
                    │  on Cloudflare   │
                    │  Workers         │
                    └────────┬─────────┘
                             │
                ┌────────────┼─────────────┐
                ▼            ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌────────────┐
        │Cloudflare│  │ Google   │  │ Better     │
        │   D1     │  │ Sheets   │  │ Auth       │
        │ (SQLite) │  │ API      │  │ (Google    │
        │          │  │          │  │  OAuth)    │
        └──────────┘  └──────────┘  └────────────┘
```

---

## 🛠️ Tech Stack

### Backend

- **[Hono](https://hono.dev/)** — Ultrafast web framework for the edge
- **[Cloudflare Workers](https://workers.cloudflare.com/)** — Edge runtime
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** — Workers-native SQLite database
- **[Drizzle ORM](https://orm.drizzle.team/)** — TypeScript-first ORM (with `drizzle-orm/d1`)
- **[Better Auth](https://www.better-auth.com/)** — Framework-agnostic authentication

### Frontend

- **[Next.js](https://nextjs.org/)** (App Router) — React framework
- **[Vercel](https://vercel.com/)** — Hosting
- **[shadcn/ui](https://ui.shadcn.com/)** — Component library
- **[Tailwind CSS](https://tailwindcss.com/)**

### Tooling

- **[pnpm workspaces](https://pnpm.io/workspaces)** — Monorepo
- **[Turborepo](https://turbo.build/)** — Build orchestration
- **[Biome](https://biomejs.dev/)** — Lint & format

---

## 📁 Repository Structure

```
tecnova-platform/
├── README.md
├── CLAUDE.md                    # Claude Code 用プロジェクト指示書
├── LICENSE
├── docs/
│   ├── requirements.md          # 全体要件定義（正典）
│   └── mvp.md                   # MVP実装ガイド
├── apps/
│   ├── api/                     # Hono on Cloudflare Workers
│   ├── checkin/                 # Next.js (iPad PWA)
│   ├── mentor/                  # Next.js (スマホPWA・Phase 1.5)
│   └── admin/                   # Next.js (PC)
├── packages/
│   ├── db/                      # Drizzle schema・migrations
│   ├── ui/                      # 共通UIコンポーネント
│   ├── shared/                  # 共通型・Zodスキーマ・Sheets連携
│   └── auth/                    # Better Auth設定
├── .env.example
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 📚 Documentation

設計ドキュメントは `docs/` 配下に配置されています。

- 📘 **[`docs/requirements.md`](./docs/requirements.md)** — 全体要件定義書
  プロジェクトの背景・目的、ステークホルダー、データモデル、API設計方針、非機能要件、リスク管理、設計判断の根拠などを網羅した完全版ドキュメント。

- 📗 **[`docs/mvp.md`](./docs/mvp.md)** — MVP実装ガイド
  最初の2週間で何をどう実装するかに集中した実装ガイド。Drizzleスキーマ、API仕様、画面仕様、Google Sheets API連携の詳細実装、セットアップ手順、トラブルシュートを含む。

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflareアカウント（Workers + D1）
- Vercelアカウント
- Google Cloud Platformアカウント（Sheets API + OAuth）

### Setup

```bash
# Clone the repository
git clone https://github.com/ut42tech/tecnova-platform.git
cd tecnova-platform

# Install dependencies
pnpm install

# Copy env example
cp .env.example .env.local
# .env.local に必要な値を設定（apps/api は別途 .dev.vars が必要）

# Generate D1 migrations from Drizzle schema
pnpm --filter @tecnova/db db:generate

# Apply migrations to the local D1 (Miniflare)
pnpm --filter @tecnova/api exec wrangler d1 migrations apply tecnova-db --local

# Run development servers
pnpm dev
```

詳細なセットアップ手順は [`docs/mvp.md`](./docs/mvp.md#8-セットアップ手順) を参照してください。

---

## 🚢 Deployment / CI

- **フロントエンド (`apps/checkin`, `apps/admin`)** — Vercel が GitHub 連携で自動デプロイ。
- **API (`apps/api`)** — GitHub Actions で `main` ブランチへの push をトリガに Cloudflare Workers へデプロイ。
  - ワークフロー: [`.github/workflows/deploy-api.yml`](./.github/workflows/deploy-api.yml)
  - 起動条件: `apps/api/**` / `packages/db/**` / `packages/shared/**` / ルート設定ファイルの変更
  - 手順: 依存解決 → 型チェック → D1 リモートマイグレーション適用 → `wrangler deploy`
- **PR/main の lint + 型チェック** — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) が `biome check` と `turbo type-check` を実行。

### Required GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に以下を登録：

| 名前 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers / D1 への deploy・migration 権限を持つ API トークン（"Edit Cloudflare Workers" テンプレート + D1 Edit 権限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

Worker の Secrets（`GOOGLE_SERVICE_ACCOUNT_KEY` 等）は CI ではなく `wrangler secret put` で別途登録済み。

---

## 🗺️ Roadmap

- [x] 設計・要件定義
- [ ] **Phase 1: MVPチェックインシステム**（運用開始対象）
  - [x] モノレポ・CI/CD基盤構築
  - [ ] Drizzleスキーマ実装
  - [ ] Google Sheets API連携PoC
  - [ ] チェックインiPadアプリ
  - [ ] 「初めての方」フロー
  - [ ] 管理画面（最小限）
  - [ ] Google OAuth認証
- [ ] **Phase 1.5: メンター業務支援**
  - [ ] メンタースマホアプリ
  - [ ] 活動ログ記入機能
  - [ ] CSVエクスポート
- [ ] **Phase 2: 中長期改善**
  - [ ] 振り返りシートOCR
  - [ ] 公開API
  - [ ] 分析ダッシュボード

---

## 🤝 Contributing

このプロジェクトはテクノバながさき固有の運用要件に基づいて設計されていますが、類似の教育・ファブリケーション活動の運営基盤として参考にしていただけます。

Issue・Discussion での質問は歓迎します。

---

## 📄 License

[MIT](./LICENSE)
