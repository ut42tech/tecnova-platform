<p align="center">
  <strong>tec-nova Nagasaki 統合管理プラットフォーム</strong>
</p>

<p align="center">
  <a href="https://github.com/ut42tech/tecnova-platform/actions/workflows/ci.yml">
    <img src="https://github.com/ut42tech/tecnova-platform/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/ut42tech/tecnova-platform/actions/workflows/deploy-api.yml">
    <img src="https://github.com/ut42tech/tecnova-platform/actions/workflows/deploy-api.yml/badge.svg" alt="Deploy API">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/ut42tech/tecnova-platform?color=blue" alt="License: MIT">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js" alt="Node.js ≥22">
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm" alt="pnpm 10">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript" alt="TypeScript 6">
</p>

---

長崎大学 NUTIC で開催される子ども向けファブリケーション活動 **「テクノバながさき」** の運営基盤プラットフォーム。

参加者のチェックイン / アウト、活動ログ記録、研究データ収集を統合的に支える内製システム。  
API-first なアーキテクチャで、複数のクライアント（iPad チェックイン機 ・ メンタースマホ ・ 管理 PC）を同一バックエンドから提供します。

---

## 📸 Screenshots

|      iPad チェックインアプリ（`apps/checkin`）       |           管理ダッシュボード（`apps/admin`）           |
| :--------------------------------------------------: | :----------------------------------------------------: |
| ![Checkin App](./docs/images/screenshot-checkin.png) | ![Admin Dashboard](./docs/images/screenshot-admin.png) |

---

## ✨ Features

### Phase 1 — MVP（✅ 実装済み）

| 機能                             | 説明                                                    |
| -------------------------------- | ------------------------------------------------------- |
| 📱 iPad PWA チェックイン         | QR / バーコードでワンタップ入退場                       |
| 🆕 「初めての方」フロー          | 事前登録情報から本人選択 → 自動採番 → アクティベート    |
| 🗂️ 事前登録管理                  | 学生側スプシの未アクティベート行を admin から追加・削除 |
| 🔗 Google Sheets 連携            | 教員側のプライバシー要件に配慮した双方向分離設計        |
| 🔐 Google OAuth + 許可リスト     | 運営者のみがアクセスできるシンプルな認証                |
| 📊 管理ダッシュボード            | 当日の来場状況をリアルタイム把握                        |
| 🔍 名前検索 & 手入力             | QR が読めない場合のフォールバック                       |
| 📋 受付履歴 & 一括チェックアウト | 当日の全操作ログとワンタップ一括退場                    |
| 📂 Drive 自動連携                | アクティベート時に GAS 経由で Drive フォルダ自動生成    |

### Phase 1.5 — 運用開始後

- 📝 メンタースマホアプリ（30 分グリッドのログ記入・未記入ハイライト）
- 🏷️ 活動カテゴリ・機材マスタ管理
- 📤 ログ CSV エクスポート

### Phase 2 — 中長期

- 🔍 振り返りシートの Vision LLM 経由 OCR 取り込み
- 🌐 公開 API（混雑状況配信）
- 📈 分析ダッシュボード（クラスター分析支援）

---

## 🏗️ Architecture

### システム全体図

```mermaid
graph TB
    subgraph Clients["🖥️ クライアント"]
        C1["📱 Checkin<br/><small>iPad PWA</small>"]
        C2["📱 Mentor<br/><small>スマホ PWA</small><br/><small>(Phase 1.5)</small>"]
        C3["💻 Admin<br/><small>PC ブラウザ</small>"]
    end

    subgraph Hosting["☁️ Vercel"]
        V1["Next.js<br/>:3000"]
        V2["Next.js<br/>(未着手)"]
        V3["Next.js<br/>:3001"]
    end

    subgraph Edge["⚡ Cloudflare"]
        API["Hono API<br/>Workers"]
        D1[("D1<br/>SQLite")]
    end

    subgraph External["🔗 外部サービス"]
        GS["Google Sheets<br/>API"]
        GA["Google OAuth<br/>via Better Auth"]
        GAS["GAS Webhook<br/>Drive 連携"]
    end

    C1 --> V1
    C2 --> V2
    C3 --> V3

    V1 -- "REST (type-safe)" --> API
    V2 -. "REST" .-> API
    V3 -- "REST (type-safe)" --> API

    API --> D1
    API --> GS
    API --> GA
    API -. "waitUntil" .-> GAS
```

### リクエスト処理フロー

```mermaid
sequenceDiagram
    participant iPad as 📱 iPad PWA
    participant API as ⚡ Hono API
    participant Auth as 🔐 Better Auth
    participant D1 as 🗄️ D1 (SQLite)
    participant GS as 📊 Google Sheets

    iPad->>API: POST /checkin/activate
    API->>Auth: Cookie 認証チェック
    Auth-->>API: mentor 認証 OK
    API->>GS: スプシから事前登録取得
    GS-->>API: 参加者情報
    API->>D1: participants INSERT + 採番
    D1-->>API: 新規 ID (5桁)
    API-->>iPad: { participantId, displayId }
```

---

## 🛠️ Tech Stack

### Backend

| Technology                                                                                                    | Purpose                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| ![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)                                 | Ultrafast web framework for the edge |
| ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white) | Edge runtime                         |
| ![D1](<https://img.shields.io/badge/Cloudflare_D1_(SQLite)-F38020?logo=cloudflare&logoColor=white>)           | Workers-native database              |
| ![Drizzle](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)                 | TypeScript-first ORM                 |
| ![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-000?logoColor=white)                              | Framework-agnostic authentication    |

### Frontend

| Technology                                                                                           | Purpose                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| ![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=next.js)                                 | React framework (App Router) |
| ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)                    | UI library                   |
| ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000?logo=shadcnui&logoColor=white)             | Component library            |
| ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white) | Utility-first CSS            |
| ![Vercel](https://img.shields.io/badge/Vercel-000?logo=vercel&logoColor=white)                       | Hosting & deployment         |

### Tooling

| Technology                                                                                   | Purpose                  |
| -------------------------------------------------------------------------------------------- | ------------------------ |
| ![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)               | Monorepo package manager |
| ![Turborepo](https://img.shields.io/badge/Turborepo-2-0F0F0F?logo=turborepo&logoColor=white) | Build orchestration      |
| ![Biome](https://img.shields.io/badge/Biome-2.4-60A5FA?logo=biome&logoColor=white)           | Lint & format            |

---

## 📁 Repository Structure

```
tecnova-platform/
├── .github/workflows/
│   ├── ci.yml                     # Biome check + Type check (PR / main push)
│   └── deploy-api.yml             # D1 migration + Workers deploy (main push)
├── apps/
│   ├── api/                       # Hono on Cloudflare Workers
│   │   └── src/
│   │       ├── index.ts           # エントリポイント + CORS/Auth middleware
│   │       ├── routes/            # checkin/* / api/* ルート群
│   │       ├── middleware/        # requireAuthenticatedMentor 等
│   │       ├── lib/               # auth factory, checkin ロジック
│   │       └── types.ts           # Env bindings 型定義
│   ├── checkin/                   # Next.js 16 — iPad PWA
│   │   └── src/
│   │       ├── app/               # App Router pages (/, /login, /first-time, etc.)
│   │       ├── components/        # QRスキャナ, 受付カード, 履歴テーブル
│   │       └── lib/               # api-client, auth-client
│   └── admin/                     # Next.js 16 — 管理画面 (PC)
│       └── src/
│           ├── app/               # ダッシュボード, 参加者一覧, メンター管理
│           ├── components/        # データテーブル, フォーム
│           └── lib/               # api-client, auth-client
├── packages/
│   ├── db/                        # Drizzle schema + D1 migrations
│   ├── shared/                    # 共通型・Zod スキーマ・Sheets 連携
│   └── ui/                        # 共通 UI (api-client / MeProvider / JST utils)
├── docs/
│   ├── requirements.md            # 全体要件定義書
│   ├── mvp.md                     # MVP 実装ガイド
│   └── handoff.md                 # セッション引き継ぎノート
├── biome.json
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 📚 Documentation

| ドキュメント                                        | 内容                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📘 [`docs/requirements.md`](./docs/requirements.md) | プロジェクトの背景・目的、ステークホルダー、データモデル、API 設計方針、非機能要件、リスク管理、設計判断の根拠を網羅した全体要件定義書                                  |
| 📗 [`docs/mvp.md`](./docs/mvp.md)                   | 最初の 2 週間で何をどう実装するかに集中した実装ガイド。Drizzle スキーマ、API 仕様、画面仕様、Google Sheets API 連携の詳細実装、セットアップ手順、トラブルシュートを含む |
| 📙 [`docs/handoff.md`](./docs/handoff.md)           | 開発引き継ぎノート。進捗ステータス・既知の罠と回避策・残タスクをまとめた実装者向けドキュメント                                                                          |

---

## 🚀 Getting Started

### Prerequisites

| ツール                | バージョン         |
| --------------------- | ------------------ |
| Node.js               | ≥ 22               |
| pnpm                  | ≥ 10               |
| Cloudflare アカウント | Workers + D1       |
| Vercel アカウント     | —                  |
| GCP                   | Sheets API + OAuth |

### Setup

```bash
# Clone
git clone https://github.com/ut42tech/tecnova-platform.git
cd tecnova-platform

# Install dependencies
pnpm install

# Copy env example
cp .env.example .env.local
# .env.local に必要な値を設定（apps/api は別途 .dev.vars が必要）

# Generate D1 migrations
pnpm --filter @tecnova/db db:generate

# Apply migrations to local D1 (Miniflare)
pnpm --filter @tecnova/api db:apply:local

# Start all dev servers
pnpm dev
```

> [!TIP]
> `pnpm dev` は Turborepo 経由で `api` (`:8787`)・`checkin` (`:3000`)・`admin` (`:3001`) を同時起動します。

詳細なセットアップ手順は [`docs/mvp.md`](./docs/mvp.md#8-セットアップ手順) を参照してください。

---

## 🚢 Deployment & CI/CD

### パイプライン概要

```mermaid
graph LR
    subgraph Trigger["🔔 トリガー"]
        PR["Pull Request"]
        Push["Push to main"]
    end

    subgraph CI["🔍 CI (ci.yml)"]
        Lint["Biome check"]
        TC["Type check"]
    end

    subgraph Deploy["🚀 Deploy API (deploy-api.yml)"]
        TC2["Type check API"]
        Migrate["D1 Migration<br/>(remote)"]
        WD["wrangler deploy"]
    end

    subgraph Vercel["▲ Vercel"]
        VA["auto deploy<br/>checkin + admin"]
    end

    PR --> CI
    Push --> CI
    Push -- "paths: apps/api/**<br/>packages/db/**<br/>packages/shared/**" --> Deploy
    Push --> Vercel

    Lint --> TC
    TC2 --> Migrate --> WD
```

### デプロイ先

| アプリ         | プラットフォーム   | トリガー                                    |
| -------------- | ------------------ | ------------------------------------------- |
| `apps/api`     | Cloudflare Workers | GitHub Actions — `main` push (paths filter) |
| `apps/checkin` | Vercel             | GitHub 連携 — 自動デプロイ                  |
| `apps/admin`   | Vercel             | GitHub 連携 — 自動デプロイ                  |

### Required GitHub Secrets

| 名前                    | 用途                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers / D1 への deploy・migration 権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID                                       |

> [!NOTE]
> Worker の Secrets（`GOOGLE_SERVICE_ACCOUNT_KEY` 等）は CI ではなく `wrangler secret put` で別途登録します。

---

## 🗺️ Roadmap

- [x] 設計・要件定義
- [x] **Phase 1: MVP チェックインシステム**
  - [x] モノレポ・CI/CD 基盤構築
  - [x] Drizzle スキーマ + D1 マイグレーション
  - [x] Google Sheets API 連携
  - [x] Better Auth（Google OAuth）認証基盤
  - [x] チェックイン iPad PWA アプリ
  - [x] 「初めての方」フロー + 自動採番
  - [x] QR スキャン + 手入力 + 名前検索
  - [x] 受付履歴 + 一括チェックアウト
  - [x] 管理ダッシュボード + 参加者一覧 + メンター管理
  - [x] 事前登録管理（admin）
  - [x] GAS Drive webhook 連携
  - [x] shadcn/ui テーマ統一
  - [x] 本番デプロイ（Workers + Vercel）
  - [ ] フロントエンド UX の最終調整
  - [ ] 本番運用手順の確定（リハーサル / Wi-Fi 断フォールバック）
  - [ ] 昨年度データの D1 反映
- [ ] **Phase 1.5: メンター業務支援**
  - [ ] メンタースマホアプリ（`apps/mentor`）
  - [ ] 活動ログ記入機能
  - [ ] CSV エクスポート
- [ ] **Phase 2: 中長期改善**
  - [ ] 振り返りシート OCR
  - [ ] 公開 API
  - [ ] 分析ダッシュボード

---

## 🤝 Contributing

このプロジェクトはテクノバながさき固有の運用要件に基づいて設計されていますが、類似の教育・ファブリケーション活動の運営基盤として参考にしていただけます。

Issue・Discussion での質問は歓迎します。

---

## 📄 License

[MIT](./LICENSE)
