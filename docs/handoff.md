# セッション引き継ぎノート（2026-05-29時点）

新しい Claude セッションがこのリポジトリで作業を再開するときの起点。
このファイルは「今ここまで来ている」を素早く把握するためのもの。詳細仕様は引き続き
[`requirements.md`](./requirements.md)・[`mvp.md`](./mvp.md)・[`architecture.md`](./architecture.md)
が正典。

---

## 進捗ステータス

### 完了済み（main にマージ済み）

Phase 1（MVP）は本番デプロイ済みで稼働中。主要な完了項目と参照 PR / commit：

| 内容 | PR / commit |
| --- | --- |
| モノレポ初期化（pnpm + Turborepo + Biome） | #1 |
| docs 更新（Neon → Cloudflare D1 へ DB 切り替え） | direct commit |
| `packages/db` Drizzle/SQLite スキーマ + 初期マイグレーション | #2 |
| `apps/api` Hono on Workers + D1 binding + `/health` | #3 |
| `packages/shared/src/google-sheets.ts` + `/sheets/health` | #4 |
| 「初めての方」フロー（API + iPad UI） | #5 |
| check-in / check-out / scan エンドポイント | #6 |
| 手入力フォーム UI（QR は将来差し替え） | #7 |
| Better Auth 基盤（schema + `/api/auth/*` + middleware） | #8 |
| `apps/admin` ログイン画面 + Better Auth client | #9 |
| Bug fix: ログイン後に admin オリジンへ戻すよう callbackURL を絶対URL化 | #10 |
| API CORS/trustedOrigins を env 経由で設定可能化（本番デプロイ準備） | direct commit `9ad8603` |
| `/api/sessions/today` + `/api/participants` 参照系API | #11 |
| `/api/mentors` CRUD（admin role guard） | #12 |
| 管理ダッシュボード（当日セッション一覧） | #13, #16 |
| 参加者一覧 + メンター管理画面 | #14 |
| checkin の PWA 化（manifest, apple-icon, viewport） | #15 |
| 事前登録管理ページ（admin） + grade enum 制約 | #23 |
| checkin に opt-in QR スキャン + 確認クッション追加 | feat/checkin-qr-scanner |
| shadcn/ui へ全置換、Maia テーマ適用 | #25, #26 |
| API ルートを `routes/` + `middleware/` にモジュール分割 | #27, 859208d |
| checkin: 手入力ページ・受付プロフィール画面・出席タイル | 8e60249, 2e91f68, cdcc8d0 |
| checkin: 受付履歴 + 一括チェックアウト | 8ad5d51, f609c5b |
| checkin: ログイン画面と設定画面、ガイドラインページ | f8e59fd, 264f970 |
| checkin に GAS Drive folder webhook 連携（アクティベート時に Drive フォルダ自動生成） | 488f42d |
| checkin: マニュアル入力に「名前で探す」モード + `/checkin/participants/search` | d21ed3a |
| フロント共通コードを `@tecnova/ui` に集約（api-client / MeProvider / JST フォーマッタ） | eac8560, cbddf77, 9e97694 |
| 参加者データに 氏名（fullName）追加（スプシ B 列挿入・DB backfill） | リリース手順ログ参照 |
| 学年に `その他` を追加、旧値 `卒業` を移行 | `062378c`、リリース手順ログ参照 |
| CI/CD 整備（`ci.yml` / `deploy-api.yml`） | `.github/workflows/` |
| 本番デプロイ（Worker + admin + checkin、OAuth まで動作確認済み） | — |

**設計上の判断メモ：**

- **Better Auth を `/api/*` 参照系より先に実装した**。`/api/*` 系エンドポイントが認証必須で、
  後から auth を retrofit するより auth 基盤を先に通したほうが安全だったため。詳細は PR #8 の本文。
- **`/checkin/*` も Cookie 認証必須に格上げ**（5月の改修で）。受付端末は子どもが直接
  触る端末ではなく受付メンターの端末である前提に倒し、`apiCors` + `requireAuthenticatedMentor`
  を `/api/*` と同じく適用している（`apps/api/src/index.ts`）。

### develop にあり main 未反映（意図的に据え置き）

- **参加回数統計（PR #33: ターム分類・30 分カウント・会場横断集計）** は `develop` に
  マージ済みだが **`main` には入れていない**＝本番（Worker / Vercel）未反映。デモでは
  使ったが、2026-05-29 に「本番には出さず develop 据え置き」と判断した。本番に出す場合は
  `develop` → `main` マージで `deploy-api.yml` 経由の Worker デプロイ + admin/checkin の
  Vercel 反映が走る。
  - 該当 commit: `eea5313`（`/api/stats/participation`）, `0c762be`（profile API 拡張）,
    `f90d55d`（venue-schedule モジュール）, `7db3e1d`（shared schema 拡張）,
    `b5a83f9`（checkin 受付 UI）, `32aa8fa`（admin 統計ページ）
- **会場サイネージ `apps/signage`（PR #37: 放送風サイネージ＋チャイム・YouTube 版）** は
  2026-05-30 に `develop` にマージ済みだが **`main` には入れていない**＝本番（Worker / Vercel）
  未反映。大型モニター・キオスク向けの新アプリ（Next.js 16 / React 19・dev ポート 3002・
  Vercel デプロイ）で、活動フェーズ中は YouTube 動画再生、休憩/待機はオーバーレイ、右レーンに
  チャイムカウントダウン・ターム/サイクル、下部に巡回インフォを出す。チャイムは Web Audio 合成、
  50分活動/10分休憩サイクルは `@tecnova/shared/activity-cycle`。認証は checkin/admin と同じ
  メンター・ホワイトリスト（テクノバ共有の管理用 Google アカウントで1回ログイン）。稼働判定・
  在館数は認証付き `GET /api/sessions/today` を再利用。
  - 新規 API（`/api/signage` 配下・メンター認証必須）：`/playlist`（YouTube Data API・
    Worker キャッシュ）、`/previous-summary`（前回開催の来場/滞在集計・PII なし）、`/health`
    （D1 到達性）。本番に出す場合は `develop` → `main` マージで Worker / Vercel に反映される。
  - 詳細仕様: `docs/superpowers/specs/2026-05-29-signage-chime-design.md`、
    実装計画: `docs/superpowers/plans/2026-05-30-signage-chime-app.md`。

### 現状動作している範囲

ローカル開発 (`pnpm --filter @tecnova/api dev` + `pnpm --filter checkin dev` +
`pnpm --filter admin dev`) で：

- iPad PWA 側（`localhost:3000`、Better Auth セッション必須）：
  - `/login` → Google OAuth → mentors 許可リスト判定 → `/`
  - `/` 常時カメラ起動の QR スキャナ + 右に 3 つのショートカット
    （初めての人 / 受付りれき / マニュアル入力）
  - 5 桁 ID を認識すると `/reception/participants/[id]` へ遷移
  - `/reception/participants/[id]`：受付プロフィール画面。
    `GET /checkin/participants/:id` で stats を取り、`current.nextAction` に応じた
    単一ボタン（チェックイン or チェックアウト）→ `POST /checkin/participants/:id/attendance`
  - `/first-time` 未アクティベート一覧 → タップ → `/checkin/activate` → ID表示
  - `/manual` ID 入力 or 名前検索（`GET /checkin/participants/search`）
  - `/history` 当日履歴 + 在場中の参加者を選んで `POST /checkin/history/check-out-bulk`
  - `/settings` ログアウト導線、`/guideline` 子ども向けガイド
- 管理画面（`localhost:3001`）：
  - `/login` → Google OAuth → mentors 許可リスト判定 → `/` でユーザー名表示
  - 未ログインで `/` を叩くと `/login` に飛ぶ
  - 許可リスト外メアドだと 403「アクセス権限がありません」
  - `admin` ロールなら `/pre-registrations`（事前登録の追加/削除）と `/mentors` が利用可能
- API（`localhost:8787`）：
  - public: `/health`, `/sheets/health`
  - Better Auth: `/api/auth/*`
  - `/checkin/*`（mentor 認証必須）:
    - `/pre-registered`, `/activate`
    - `/sessions/check-in`, `/sessions/check-out`, `/scan`
    - `/history/today`, `/history/check-out-bulk`
    - `/participants/search`
    - `/participants/:id`, `/participants/:id/attendance`
  - `/api/*`（mentor 認証必須）:
    - `/me`（middleware 動作確認用）
    - `/sessions/today`, `/participants`
    - `/mentors`（admin CRUD）
    - `/pre-registrations`（admin：学生側スプシの追加/削除）
    - `/signage/*`（develop のみ・main 未反映）: `/playlist`（YouTube Data API・Worker
      キャッシュ）、`/previous-summary`（前回開催の集計・PII なし）、`/health`（D1 到達性）
  - アクティベート時は `c.executionCtx.waitUntil()` で GAS Drive webhook を背面呼び出し
    （`GAS_DRIVE_WEBHOOK_URL` / `GAS_DRIVE_WEBHOOK_SECRET` 未設定なら no-op）
- サイネージ（`localhost:3002`、develop のみ・Better Auth セッション必須）：
  - `/login` → Google OAuth → mentors 許可リスト判定 → `/`（共有管理アカウントで1回ログイン）
  - `/` 放送風サイネージ本体（活動中=YouTube 再生・休憩/待機=オーバーレイ・右レーンに
    チャイムカウントダウン・下部に巡回インフォ）。`?debug=1` で擬似時計・稼働強制・手動チャイムの
    プレビューバーが出る（本番フラグ無しは影響ゼロ）

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

**Phase 1（MVP）は完了。デモンストレーションも実施済み。**

運用開始前の最終調整として挙げていた残タスク（受付画面の実機検証 / 採番衝突の自動リトライ /
運用手順の文書化 / 昨年度データの D1 移行）は、2026-05-29 に **不要と判断して取り下げた**。
同時タップ起因の採番衝突などは、発生時に手動再試行で回復する運用で確定（`apps/api/src/lib/checkin.ts`
の TODO は将来 problem 化した場合のみ着手。`docs/mvp.md` 4.2 / 10.3 も同方針に更新済み）。

次に着手するのは Phase 1.5（運用開始後の機能拡張）。

### Phase 1.5（運用開始後）

- メンタースマホアプリ（`apps/mentor` — 未着手。30 分グリッドのログ記入・未記入ハイライト）
- 活動ログ記入機能、活動カテゴリ・機材マスタ管理
- ログ CSV エクスポート
- ターム境界の締め自動化（現状は受付端末「受付りれき」からの手動一括チェックアウト運用。
  `docs/mvp.md` §3.2 / 7章参照）

### サイネージ（`apps/signage`）の残作業

機能は develop で動作済み。本番運用に向けて未確定の設定値・現地作業が残る：

- 共催（長崎市など）の実ロゴ差し替え（現状はテキスト表記でロゴ未配置）
- 公式 Instagram ハンドル等の運用設定値（`src/config/info-slides.ts`）の本番値確認（要確認）
- 本番キオスク端末（Chromium `--kiosk`・常時電源・wake lock）の現地設定
- 本番反映（`develop` → `main` マージ）と、それに伴う Worker Secrets への
  `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` 登録・`TRUSTED_ORIGINS` へのサイネージ本番
  ドメイン追加（要確認）

---

## 重要：今までに踏んだ罠と回避策

新しいセッションが知っておくべき非自明なこと。

### `/checkin/*` の認証境界が変わっている

- 当初設計（`requirements.md` 8.2）では `/checkin/*` は認証なしだったが、
  受付端末はメンターが操作する前提に倒したため、5月の改修で **mentor 認証必須に変更**
- `apps/api/src/index.ts` で `/api/*` と `/checkin/*` の両方に `apiCors` +
  `requireAuthenticatedMentor` を適用している
- フロント側は `apps/checkin` も `apps/admin` 同様に `/login` を持ち、`MeProvider`
  でセッションを取得する

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
  保持しない（接続ロック問題、`docs/mvp.md` 10.1 / `CLAUDE.md`「重要な制約 2」）
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

### サイネージ（`apps/signage`）の必須 env が増えた

- API 側 Secrets / `.dev.vars` に `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` が必要
  （`/api/signage/playlist` が YouTube Data API を叩くため）
- `TRUSTED_ORIGINS` にサイネージ origin（dev: `http://localhost:3002`、本番はサイネージ
  ドメイン）を追加しないと CORS で 401/403 になる（CORS と Better Auth trustedOrigins の
  両方に効く）
- フロント側は `NEXT_PUBLIC_API_URL`（未設定時 `http://localhost:8787`）
- 新しい `@tecnova/*` パッケージを使うときは signage の `next.config.ts` の
  `transpilePackages` に追加する

### サイネージの YouTube 広告は埋め込み側で消せない

- 仕様 §5.3：埋め込みプレーヤーは所有しない動画の広告を削除・スキップできない
  （プログラム的スキップは YouTube API Developer Policies 違反）
- 広告フリーを確実にできるのは **YPP 加入チャンネルで収益化オフにした自前アップロード動画**
  か、self-host のみ
- 再生順は自前キュー（`loadVideoById`）で関連動画/終了画面を抑止している

### サイネージの音声自動再生・キオスク起動

- ブラウザのオートプレイ制限のため、起動時「タップして開始」ゲートで chime（Web Audio）
  解放・全画面・wake lock を行う。ミュート動画はタップ前から再生される
- 本番は Chromium を `--kiosk` 等で起動する（横向き・スリープ無効は OS/ディスプレイ層で固定）

### サイネージの `?debug=1` プレビューモード

- `?debug=1` を付けたときだけ擬似時計（ジャンプ/速度×1×30×120/一時停止）・稼働強制・
  手動チャイムの操作バーが出て、実時刻を待たず全状態・遷移・チャイムを検証できる
- 本番（フラグ無し）は影響ゼロ（`debugEnabled=false` で全分岐が短絡＝従来挙動と完全同値）

### サイネージのセキュリティレビュー済み（2026-05-30）

- signage PR は 2026-05-30 にセキュリティレビューを実施し、新規の悪用可能な脆弱性なしを確認
- 根拠：`/api/signage/*` はメンター認証必須・`/previous-summary` は集計のみで PII なし・
  CORS は `TRUSTED_ORIGINS` の厳格照合

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
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001
```

`TRUSTED_ORIGINS` はカンマ区切り。`/api/*` と `/checkin/*` の CORS と Better Auth の
trustedOrigins の3か所で使われる。`/checkin/*` も Cookie 認証必須になったので、
checkin の Vercel URL も本番 Worker secret に含めること。本番では admin / checkin の
Vercel URL を両方 Worker secret に登録済み。

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

---

## 学年「その他」追加リリース手順（2026-05-22）

学年の正規値に `その他` を追加し、旧値 `卒業` は運用データ更新で `その他` に置換する。
スプレッドシートの実データは以下の手順で手動更新する。

### デプロイ / 更新順序

1. **新コードをデプロイ**:
   - api: `pnpm --filter @tecnova/api deploy`
   - admin / checkin: 通常の Vercel デプロイ（main マージで自動）
2. **DB マイグレーション適用（remote）**:
   ```bash
   pnpm --filter @tecnova/api db:apply:remote
   ```
   `0003_graduated_grade_to_other.sql` が `participants.grade = '卒業'` を `その他` に更新する。
3. **学生側スプシを手動更新**:
   1. 対象スプレッドシートを開き、`participants` シートを確認する
   2. 作業前にスプレッドシート全体、または `participants` シートを複製してバックアップする
   3. D列「学年」を対象に検索またはフィルタで `卒業` を抽出する
   4. 該当セルをすべて `その他` に置換する
   5. D列で `卒業` を再検索し、0件であることを確認する
   6. `小1`〜`高3` と `その他` 以外の値が残っていないか、必要に応じてD列を目視確認する
4. **学年上げ運用の確認**:
   - スプレッドシート側や外部運用で `卒業` を作っている場合、出力値を `その他` に変更する
5. **動作確認**:
   - admin の事前登録追加で学年初期値が未選択になっている
   - `その他` を選んで新規追加できる
   - 利用者一覧の `その他` フィルタで更新済みデータが表示される

---

## 氏名（fullName）追加リリース手順（2026-05-13 着手）

参加者データに **氏名（本名）** を追加した。学生側スプシは **B列に氏名を挿入** し、既存
列を1つずつ右にシフト（A=preRegId / B=氏名 / C=ニックネーム / D=学年 / E=事前登録日 /
F=内製ID / G=アクティベート日時 / H=アクティベート済）。

DBは `participants.full_name` を NOT NULL DEFAULT '' で追加。既存行は backfill する。

**重要**: 新コード（A2:H 前提）が旧スプシ（A2:G）を読むと列マッピングがズレて読み書きが
崩壊する。**必ず以下の順序で実施する**。途中で運用中の iPad / 管理画面からアクセスが
あると不整合が出るのでメンテ枠を取る。

### デプロイ順序

1. **メンテモード**（運用停止時間枠を確保。iPad / admin から触らない）
2. **学生側スプシを手動更新**:
   1. `participants` シートで **B 列を挿入**（既存 B〜G が C〜H にシフトされる）
   2. B1 セルに `氏名` ヘッダーを入力
   3. 既存全行 B 列に教員管理スプシから氏名を転記（事前登録ID をキーに突合）
3. **DB マイグレーション適用（remote）**:
   ```bash
   pnpm --filter @tecnova/api db:apply:remote
   ```
   `0002_early_network.sql` が `ALTER TABLE participants ADD full_name TEXT DEFAULT ''
   NOT NULL` を適用する。
4. **DB backfill**: スプシ B 列に入れた氏名を DB の `participants.full_name` に流す。
   既存件数が少ないので 1 件ずつ手書きの SQL で十分:
   ```bash
   cd apps/api
   npx wrangler d1 execute <DB_NAME> --remote --command "UPDATE participants SET full_name = '田中太郎' WHERE id = '26001'"
   # ... 全件分繰り返す
   ```
   件数が増えてきたら `wrangler d1 execute --file backfill.sql` で一括投入する方が早い。
5. **新コードをデプロイ**:
   - api: `pnpm --filter @tecnova/api deploy`
   - admin / checkin: 通常の Vercel デプロイ（main マージで自動）
   - 順序は api → 各フロント。フロントは古い fullName 無しのレスポンスを Zod でリジェクト
     するため、api が先に新形式を返す状態にしてから上げる
6. **動作確認**:
   - admin 事前登録の新規追加で 氏名・ニックネーム・学年・事前登録日 が入る
   - スプシ A〜E 列に新規行が `preRegId / 氏名 / ニックネーム / 学年 / 事前登録日`
     順で書き込まれていること
   - iPad の「初めての方」一覧で氏名が表示されること
   - 活性化後にスプシ F/G/H 列に internalId / activatedAt / TRUE が書かれていること
   - QRスキャンで チェックイン/アウト の結果カードに氏名が出ること
7. **メンテモード解除**

### ロールバック手順

- 万一フロントが落ちた場合、api は古いフロントとは互換しない（フロントが fullName
  必須を期待）。**api を先に旧バージョンに戻す → スプシの B 列を再削除 → DB
  migration を down**（drizzle-kit が生成する down SQL は無いので、`ALTER TABLE
  participants DROP COLUMN full_name` を手書き）→ フロントを戻す、の順。
- スプシ B 列を消す前にバックアップ（シート複製）を取ること。
