# セッション引き継ぎノート（2026-05-05時点）

新しい Claude セッションがこのリポジトリで作業を再開するときの起点。
このファイルは「今ここまで来ている」を素早く把握するためのもの。詳細仕様は引き続き
[`requirements.md`](./requirements.md) と [`mvp.md`](./mvp.md) が正典。

---

## 進捗ステータス

### 完了済み（main にマージ済み）

`docs/mvp.md` 9章のスケジュール基準で：

| Day | 内容 | PR |
| --- | --- | --- |
| W1 Day 1-2 | モノレポ初期化（pnpm + Turborepo + Biome） | #1 |
| - | docs 更新（Neon → Cloudflare D1 へ DB 切り替え） | direct commit |
| W1 Day 3 | `packages/db` Drizzle/SQLite スキーマ + 初期マイグレーション | #2 |
| W1 Day 4 | `apps/api` Hono on Workers + D1 binding + `/health` | #3 |
| W1 Day 5 | `packages/shared/src/google-sheets.ts` + `/sheets/health` | #4 |
| W1 Day 6-7 | 「初めての方」フロー（API + iPad UI） | #5 |
| W2 Day 8 | check-in / check-out / scan エンドポイント | #6 |
| W2 Day 8 | 手入力フォーム UI（QR は将来差し替え） | #7 |
| W2 Day 11 | Better Auth 基盤（schema + `/api/auth/*` + middleware） | #8 |
| W2 Day 11 | `apps/admin` ログイン画面 + Better Auth client | #9 |
| - | Bug fix: ログイン後に admin オリジンへ戻すよう callbackURL を絶対URL化 | #10 |
| - | API CORS/trustedOrigins を env 経由で設定可能化（本番デプロイ準備） | direct commit `9ad8603` |
| W2 Day 10 | `/api/sessions/today` + `/api/participants` 参照系API | #11 |
| W2 Day 10 | `/api/mentors` CRUD（admin role guard） | #12 |
| W2 Day 10 | 管理ダッシュボード（当日セッション一覧） | #13, #16 |
| W2 Day 10 | 参加者一覧 + メンター管理画面 | #14 |
| W2 Day 9 | checkin の PWA 化（manifest, apple-icon, viewport） | #15 |
| - | 事前登録管理ページ（admin） + grade enum 制約 | #23 |
| W2 Day 9 | checkin に opt-in QR スキャン + 確認クッション追加 | feat/checkin-qr-scanner |

**Day 10 と Day 11 を意図的に入れ替えた**（Day 11 = Better Auth を先に）。理由は Day 10 の
`/api/*` 系エンドポイントが認証必須で、後から auth を retrofit するより auth 基盤を先に
通したほうが安全だったため。詳細は PR #8 の本文。

### 現状動作している範囲

ローカル開発 (`pnpm --filter @tecnova/api dev` + `pnpm --filter checkin dev` +
`pnpm --filter admin dev`) で：

- iPad PWA 側（`localhost:3000`）：
  - `/` ID 5桁手入力 → `/checkin/scan` → check-in / check-out 自動切替
  - `/` 「QRコードで読み取る（試験運用）」ボタン → カメラ起動 → 5桁認識
    → 確認画面（やり直す / チェックイン）→ `/checkin/scan`
  - `/first-time` 未アクティベート一覧 → タップ → `/checkin/activate` → ID表示
- 管理画面（`localhost:3001`）：
  - `/login` → Google OAuth → mentors 許可リスト判定 → `/` でユーザー名表示
  - 未ログインで `/` を叩くと `/login` に飛ぶ
  - 許可リスト外メアドだと 403「アクセス権限がありません」
  - `admin` ロールなら `/pre-registrations`（事前登録の追加/削除）と `/mentors` が利用可能
- API（`localhost:8787`）：
  - `/health`, `/sheets/health`
  - `/checkin/pre-registered`, `/checkin/activate`,
    `/checkin/sessions/check-in`, `/checkin/sessions/check-out`, `/checkin/scan`
  - `/api/auth/*`（Better Auth）
  - `/api/me`（middleware 動作確認用）
  - `/api/sessions/today`, `/api/participants`（管理画面用、auth-protected）
  - `/api/mentors`（admin専用CRUD）
  - `/api/pre-registrations`（admin専用：学生側スプシの追加/削除）

### 本番側でできていること

- Cloudflare D1 (`tecnova-db`) 作成済み・マイグレーション 0000/0001 適用済み
- Cloudflare Worker Secrets 登録済み：
  - `GOOGLE_SERVICE_ACCOUNT_KEY`（base64 エンコード済み JSON）
  - `GOOGLE_SHEETS_ID`
  - `GAS_DRIVE_WEBHOOK_URL`
  - `GAS_DRIVE_WEBHOOK_SECRET`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
- mentors テーブルに `ut42.nu@gmail.com` (`たくや`, role=admin) 投入済み（local + remote）
- **Worker / admin / checkin はすでに本番デプロイ済みで、OAuth ログインまで含めて動作確認済み**
  （本番URLは memory `project_production_urls.md` 参照）
- 本番反映のカットオフは固定値として管理せず、最新デプロイの run/commit を都度確認する運用に変更
- **CI/CD 整備済み**（`.github/workflows/`）：
  - `ci.yml`：PR / main push で `biome check` + `turbo type-check`
  - `deploy-api.yml`：main push（`apps/api/**` ほか paths フィルタ）で D1 リモートマイグレーション → `wrangler deploy`
  - 必要 GitHub Secrets：`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`（未登録なら deploy job が失敗するので登録要）

---

## 次に取り掛かるフェーズ

**MVP仕上げ（運用開始前の最終調整）**

現状、MVPの必須機能は概ね実装済み。以降は以下を優先して進める。

1. **フロントエンドUXの本格調整**
   - checkin: エラー導線、戻る導線、文言・ボタン配置、画面遷移テンポの最適化
   - admin: 一覧の可読性、更新導線、ロール別ナビ体験の改善
2. **運用手順の確定**
   - Wi-Fi断フォールバック、当日オペレーション、権限者向け手順を文書化
3. **昨年度データのD1反映**
   - 個人情報を持ち込まず、participants / events / sessions の最小構成で移行
   - JST/UTC変換と参照整合（participant_id, event_id）を検証

---

## 重要：今までに踏んだ罠と回避策

新しいセッションが知っておくべき非自明なこと。

### Better Auth と pnpm peer 解決

- Better Auth を入れると transitive で kysely が引き込まれる
- pnpm の peer dep 解決で `apps/api` 側の drizzle-orm が `kysely` フレーバーで
  resolve される一方、`packages/db` 側はノーフレーバーで resolve される
- 同じ `0.45.2` でも別ストアコピーになり、TypeScript が `SQLiteColumn` を
  別物扱いして型エラーになる
- 対策: `packages/db` にも `kysely` を devDep として入れて peer を揃える
  （PR #8 で対応済み）。今後 better-auth プラグイン等で同様の peer dep 不整合が
  出たら同じパターンで対処

### Better Auth on Workers

- `wrangler.toml` に `compatibility_flags = ["nodejs_compat"]` 必須
  （`AsyncLocalStorage` を使うため）
- auth instance は **リクエスト毎に生成**。グローバル/モジュールスコープで
  保持しない（接続ロック問題、`docs/mvp.md` 11.1 / `CLAUDE.md`「重要な制約 2」）
- `apps/api/src/lib/auth.ts` の `createAuth(env)` ファクトリがそれ

### サービスアカウント鍵は base64 ラップ

- 生 JSON を `.dev.vars` に書くと dotenv パーサが `private_key` 内の `\n` を
  実改行に変換し、`JSON.parse` が「Bad control character」で失敗する
- 対策：`base64 -i サービスアカウント.json | tr -d '\n'` でエンコード、
  Worker 側で `atob` → `JSON.parse` の順にデコード
- 実装: `packages/shared/src/google-sheets.ts` 内 `decodeServiceAccountKey`

### D1 の database_id を `wrangler.toml` で変えるとローカル状態がリセットされる

- 開発中 placeholder の `00000000-...` から本番値に差し替えたら、
  miniflare の local D1 ストア先が変わってテーブルが空になる
- 対策: `wrangler.toml` 変更後は `pnpm --filter @tecnova/api db:apply:local`
  を再実行

### CORS とクロスオリジンクッキー

- admin (3001) → API (8787) は別オリジン
- `apps/api/src/index.ts` の `/api/*` cors は `TRUSTED_ORIGINS` を参照して
  許可オリジンを動的判定 + `credentials: true`
- フロントの `authClient` は `fetchOptions.credentials: 'include'` で
  Worker のクッキーを送信
- Better Auth の `signIn.social({ callbackURL })` には**絶対URLを渡す**
  （相対パスだと Better Auth が baseURL = ワーカーで解決してしまう、PR #10 修正）

### 学生側スプシ ID は Secret 扱い

- `docs/mvp.md` の初期版は `[vars]` だったが Public リポジトリ運用方針と
  矛盾するため Secret 扱いに統一（PR #4 のドキュメント更新）

---

## まだやっていない・残作業（順不同）

- **iPad実機確認後のUX仕上げ**：読み取り失敗時の導線・表示文言・戻りフローの微調整
- **運用リハーサル**：受付開始〜終了までの通し手順、ネットワーク障害時オペレーション確認
- **昨年度データ反映**：匿名化済みデータの投入設計・整合性確認・ロールバック手順整備
- **同時アクティベート採番衝突のリトライ実装**：`apps/api/src/lib/checkin.ts` TODO の解消
- **Phase 1.5 系**：メンタースマホアプリ、活動ログ、CSVエクスポート等

---

## 環境ファイル（参考）

ユーザー側の `apps/api/.dev.vars` には以下が入っているはず（中身は秘密）：

```
GOOGLE_SERVICE_ACCOUNT_KEY=<base64>
GOOGLE_SHEETS_ID=<sheet id>
GAS_DRIVE_WEBHOOK_URL=<apps script web app /exec url>
GAS_DRIVE_WEBHOOK_SECRET=<gas shared secret>
GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
BETTER_AUTH_SECRET=<openssl rand -hex 32 で生成>
BETTER_AUTH_URL=http://localhost:8787
TRUSTED_ORIGINS=http://localhost:3001
```

`TRUSTED_ORIGINS` はカンマ区切り。`/api/*` の CORS と Better Auth の trustedOrigins
の両方で使われる。本番では admin の Vercel URL を Worker secret に登録済み。

## ユーザーの作業スタイルメモ

`~/.claude/projects/.../memory/` に保存済みの feedback と重複するが、要点：

- **ミニマム・シンプル優先**：Phase 1.5 以降のものを先取りで作らない
- **API 最優先**：UI/UX 整えは最後
- **CLI 経由で初期化**：`create-next-app` 等を手書きで再現しない（だが2個目以降は
  apps/checkin を複製した方が早い説を本人も認識）
- **小さい論理単位でコミット**：PR内も複数コミットに分けて積み上げる
- **CLI ツールはローカル devDep**：wrangler 等をグローバルに入れない
- **Public リポジトリ運用**：シークレット類は `wrangler secret put` または
  Vercel 環境変数。`.env.example` には変数名のみ
