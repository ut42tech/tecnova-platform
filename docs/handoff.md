# セッション引き継ぎノート（2026-10-11時点）

新しい Claude セッションがこのリポジトリで作業を再開するときの起点。
このファイルは「今ここまで来ている」を素早く把握するためのもの。詳細仕様は引き続き
[`requirements.md`](./requirements.md)・[`mvp.md`](./mvp.md)・[`architecture.md`](./architecture.md)
が正典。

---

## いまの状態（サマリ）

- **Phase 1（MVP）と、その後の拡張（参加回数統計・会場サイネージ・admin 刷新・
  checkin データ層整理）はすべて本番稼働中**。
- `main` と `develop` は同一コミット（最終更新 2026-06-11 / `5f5c131`）。
  **develop にあって本番未反映の変更は無い**。
- 会場サイネージ（`apps/signage`）も本番で問題なく稼働しており、完了扱い（2026-10 確認）。
- **2026-10 に計画を見直した**：メンターによる活動ログ記入（メンターアプリ）は取りやめ、
  子ども自身が振り返り・目標設定を記録する方針に変更（`requirements.md` §3.5）。
- **直近の優先事項**は「チェックイン記録の修正機能」と「QR 読み取り精度の改善」→
  [次に取り掛かる候補](#次に取り掛かる候補)。

---

## 完了済み（すべて main = 本番に反映済み）

| 内容 | PR / commit |
| --- | --- |
| モノレポ初期化（pnpm + Turborepo + Biome） | #1 |
| `packages/db` Drizzle/SQLite スキーマ + 初期マイグレーション（DB は Cloudflare D1） | #2 |
| `apps/api` Hono on Workers + D1 binding + `/health` | #3 |
| `packages/shared/src/google-sheets.ts` + `/sheets/health` | #4 |
| 「初めての方」フロー（API + iPad UI） | #5 |
| check-in / check-out / scan エンドポイント、手入力フォーム | #6, #7 |
| Better Auth 基盤（schema + `/api/auth/*` + middleware）、admin ログイン | #8, #9, #10 |
| 参照系 API（`/api/sessions/today`, `/api/participants`）、`/api/mentors` CRUD | #11, #12 |
| 管理ダッシュボード・参加者一覧・メンター管理 | #13, #14, #16 |
| checkin の PWA 化、opt-in QR スキャン + 確認クッション | #15, feat/checkin-qr-scanner |
| 事前登録管理ページ（admin） + grade enum 制約 | #23 |
| shadcn/ui へ全置換（Maia テーマ） | #25, #26 |
| API ルートを `routes/` + `middleware/` にモジュール分割 | #27 |
| checkin: 受付プロフィール画面・受付履歴 + 一括チェックアウト・ログイン/設定・ガイドライン | 8e60249, 8ad5d51, f8e59fd ほか |
| アクティベート時の GAS Drive フォルダ自動生成 webhook | 488f42d |
| checkin: マニュアル入力に「名前で探す」モード | d21ed3a |
| フロント共通コードを `@tecnova/ui` に集約（api-client / MeProvider / JST フォーマッタ） | eac8560, cbddf77, 9e97694 |
| 参加者データに氏名（fullName）追加、学年に `その他` 追加（旧 `卒業` を移行） | migration 0002 / 0003 |
| CI/CD 整備（`ci.yml` / `deploy-api.yml`） | `.github/workflows/` |
| 参加回数統計（ターム分類・30 分ルール・会場横断集計）+ 受付プロフィールの参加回数表示 | #33, #34 |
| checkin 画面リデザイン（motion 共通化・スキャン→プロフィール遷移） | #35 |
| 会場サイネージ `apps/signage`（放送風・チャイム・YouTube 再生・巡回インフォ） | #37 |
| admin UI 刷新（レスポンシブ・ダークモード・PWA・公式ロゴ・motion） | #40 |
| Claude Code 用 hooks / subagents / skills（`.claude/`） | #40 に同梱 |
| admin データ層モダン化（`useApiResource` 共通化 + 即時インタラクティブシェル） | #41, #42, #43 |
| checkin データ層を `useApiResource` に移行（background reload） | #44 |
| checkin 参加ガイドラインの文言・レイアウト刷新、受付文言を「メンター」に統一 | #46, `5f5c131` |
| 来場記録の修正（admin のみ。ダッシュボード・利用者詳細から追加・編集・削除）+ API の自動テスト基盤 | `feat/admin-session-correction` の PR（Issue #48 / #49） |

本番への反映は `develop` → `main` のリリース PR（#36 / #38 / #45 ほか）で行っている。

**設計上の判断メモ：**

- **Better Auth を `/api/*` 参照系より先に実装した**。`/api/*` 系エンドポイントが認証必須で、
  後から auth を retrofit するより auth 基盤を先に通したほうが安全だったため。詳細は PR #8 の本文。
- **`/checkin/*` も Cookie 認証必須**。受付端末は子どもが直接触る端末ではなく受付メンターの
  端末である前提に倒し、`apiCors` + `requireAuthenticatedMentor` を `/api/*` と同じく
  適用している（`apps/api/src/index.ts`）。
- **admin のサーバー取得（RSC + Suspense、通称 SP3）は見送り**。admin API は全エンドポイントが
  per-user Cookie 認証のため、サーバー取得には auth 再設計が必須になり、内製管理画面には
  割に合わない。データ層モダン化は SP1（`useApiResource`）+ SP2（即時シェル）で完了。
  根拠: `docs/superpowers/specs/2026-06-02-admin-data-layer-modernization-design.md`
- **採番衝突の自動リトライ・運用手順の文書化・昨年度データの D1 移行は 2026-05-29 に取り下げ**。
  同時タップ起因の採番衝突は、発生時に手動再試行で回復する運用で確定
  （`apps/api/src/lib/checkin.ts` の TODO は将来 problem 化した場合のみ着手。
  `docs/mvp.md` 4.2 / 10.3 も同方針）。

---

## 本番で動いている機能

ローカル開発時のポートを併記（`pnpm dev` で全アプリ起動）。

### 受付端末 `apps/checkin`（iPad PWA・:3000）

すべて Better Auth セッション必須（`/login` → Google OAuth → mentors 許可リスト判定）。

- `/` QR スキャナ（「タップしてQRを読み取る」で起動、20 秒で自動停止）+ 右に 3 つのショートカット
  （初めての人 / 受付りれき / マニュアル入力）。5 桁 ID を認識すると受付プロフィールへ遷移
- `/reception/participants/[id]`：受付プロフィール画面。参加回数（ターム別）を表示し、
  `current.nextAction` に応じた単一ボタン（チェックイン or チェックアウト）
- `/first-time` 未アクティベート一覧 → タップ → アクティベート → ID 表示
- `/manual` ID 入力 or 名前検索
- `/history` 当日履歴 + 在場中の参加者を選んで一括チェックアウト
- `/settings` ログアウト導線、`/guideline` 子ども向け参加ガイドライン

### 管理画面 `apps/admin`（PC・モバイル / PWA・:3001）

- `/` ダッシュボード（日付を選んで任意の開催日のセッション一覧）
- `/participants` 利用者一覧（ID / 氏名 / ニックネーム検索・学年 / 状態フィルタ・詳細シート）
- `/stats` 参加回数統計（ターム別・日別）
- `/pre-registrations` 事前登録の追加/削除、`/mentors` メンター管理（いずれも **admin ロールのみ**。
  ナビは `apps/admin/src/components/nav-items.ts` の `adminOnly` で出し分け）

### 会場サイネージ `apps/signage`（大型モニター・キオスク・:3002）

- `/login` → 共有の管理用 Google アカウントで 1 回ログイン
- `/` 放送風サイネージ本体（活動中 = YouTube 再生・休憩/待機 = オーバーレイ・右レーンに
  チャイムカウントダウンとターム/サイクル・下部に巡回インフォ）。50 分活動 / 10 分休憩サイクルは
  `@tecnova/shared/activity-cycle`
- 詳細仕様: `docs/superpowers/specs/2026-05-29-signage-chime-design.md`

### API `apps/api`（Hono on Cloudflare Workers・:8787）

- public: `/health`, `/sheets/health`
- Better Auth: `/api/auth/*`
- `/checkin/*`（mentor 認証必須）:
  - `/pre-registered`, `/activate`
  - `/sessions/check-in`, `/sessions/check-out`, `/scan`
  - `/history/today`, `/history/check-out-bulk`
  - `/participants/search`, `/participants/:id`, `/participants/:id/attendance`
- `/api/*`（mentor 認証必須）:
  - `/me`
  - `/sessions/today`, `/sessions?date=`, `/events`（開催日セレクタ用・最新 50 件）
  - `/stats/participation`（`from` / `to` で期間指定）
  - `/participants`
  - `/mentors`（GET / POST / PATCH・**admin のみ**）
  - `/pre-registrations`（GET / POST / DELETE・**admin のみ**、学生側スプシを操作）
  - `/signage/playlist`（YouTube Data API・Worker キャッシュ）、`/signage/previous-summary`
    （前回開催の集計・PII なし）、`/signage/health`
- アクティベート時は `c.executionCtx.waitUntil()` で GAS Drive webhook を背面呼び出し
  （`GAS_DRIVE_WEBHOOK_URL` / `GAS_DRIVE_WEBHOOK_SECRET` 未設定なら no-op）

---

## 本番環境

- **Cloudflare D1**（`tecnova-db`）：マイグレーション 0000〜0003 適用済み。以後のマイグレーションは
  `main` への push で `deploy-api.yml` が自動適用する
- **Cloudflare Worker Secrets** 登録済み：
  `GOOGLE_SERVICE_ACCOUNT_KEY`（base64）/ `GOOGLE_SHEETS_ID` / `GAS_DRIVE_WEBHOOK_URL` /
  `GAS_DRIVE_WEBHOOK_SECRET` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` /
  `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `YOUTUBE_API_KEY` /
  `YOUTUBE_PLAYLIST_ID` / `TRUSTED_ORIGINS`（admin・checkin・signage の本番オリジン）
- **Vercel**：`tecnova-platform-admin` / `-checkin` / `-signage` の 3 プロジェクト。
  `main` への push で Production、PR で Preview がデプロイされる
- mentors テーブルに管理者（role=admin）を投入済み
- 本番 URL は Public リポジトリのため記載しない（ローカルの Claude memory で管理）
- **CI/CD**（`.github/workflows/`）：
  - `ci.yml`：PR / main push で `biome check` + `turbo type-check`
  - `deploy-api.yml`：main push（`apps/api/**`・`packages/db/**`・`packages/shared/**` ほか）で
    API type-check → D1 リモートマイグレーション → `wrangler deploy`
  - 必要 GitHub Secrets：`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- **D1 のバックアップはリポジトリ外**で運用している（GAS → Google Drive に日次 SQL ダンプ）。
  コードを読んでも見つからないので、DR / データ保全の話題ではこの存在を前提にすること

---

## 次に取り掛かる候補

### 直近の優先事項（2026-10 時点）

**1. QR 読み取り精度の改善（バグ）**

- 現場のフィードバック：受付端末（checkin `/`）の QR スキャナが、iPad を常駐させてページを開いた
  まましばらく置くと、映像は動いているのに QR を読まなくなる。カメラの再起動ボタンを押すと読める
- 対応済み（現場での確認待ち）：カメラを常時起動するのをやめ、「タップしてQRを読み取る」を押した
  ときだけ起動する方式にした（読めたら遷移、20 秒で自動停止）。毎回「再起動した直後」の状態で読む
- 根本原因は未特定。候補は「zxing の連続読み取りが解析用キャンバスを起動時のサイズで固定する」
  （映像の解像度・向きが後で変わると一部しか解析しない）と「Safari が長時間動く処理を止める・
  間引く」。どちらも見た目では区別できない。この方式でも再発したら、`?debug=1` で解析中の画像や
  カメラの状態を表示する診断パネルを入れて実機で切り分ける

### その他の未対応 Issue

| Issue | 規模 | メモ |
| --- | --- | --- |
| #47 事前登録のソート順を追加順（事前登録番号順）に | 小 | `apps/api/src/lib/pre-registrations.ts` の並び替え（現状は `registeredAt` 降順）を変えるだけ |
| #39 フライング（ターム開始前）チェックインの許容 | 中・要仕様決め | 下記参照 |

**#39 の前提知識**：`classifyTerm`（`packages/shared/src/venue-schedule.ts`）は**曜日を見ず
時刻だけ**でタームを決める。そのため木曜 15:55 の来場は「昼（13:00–16:00）」と判定され、
終了まで 30 分未満なので参加回数に数えられない。Issue では「開始 10 分前まで許容」
「ターム境界 30 分の前半を前ターム・後半を後ターム扱い」などが候補。
`/api/stats/participation` は counted 判定を毎回 JS で再計算しているため、**判定ロジックを
変えると過去の集計も遡って変わる**点を仕様決めで考慮すること。`packages/shared` に vitest の
テストがあるので TDD で進めやすい。

### Phase 1.5（2026-10 見直し後）

詳細は `docs/requirements.md` §3.2 / §3.5。

- 子どもによる振り返り・目標設定のデジタル入力。現状は「子どもが紙に書く → メンターが Google
  フォームへ転記」で、メンターの負担をなくすのが目的。入力方式（Google フォーム / 自前の画面）は
  検討中
- 活動カテゴリ・機材マスタ、共同活動者の記録（保留。入力方式と合わせて判断）
- 管理画面の機能拡張（参加者編集・マスタ管理）
- ターム境界の締め自動化（現状は受付端末「受付りれき」からの手動一括チェックアウト運用。
  `docs/mvp.md` §3.2 / 7章参照）

### Phase 2

- 公開 API（混雑状況配信）、分析ダッシュボード（当面は日次 SQL ダンプを SQL で分析）、保護者向け機能

### 計画から外したもの（2026-10）

メンターアプリ・30 分グリッドの活動ログ、ログ CSV エクスポート、振り返りシートの OCR、
教員側スプシとの自動同期、iPad オフライン対応。理由は `docs/requirements.md` 付録A D16〜D19。

---

## 重要：今までに踏んだ罠と回避策

新しいセッションが知っておくべき非自明なこと。

### `/checkin/*` の認証境界が当初設計と違う

- 当初設計（`requirements.md` 8.2）では `/checkin/*` は認証なしだったが、
  受付端末はメンターが操作する前提に倒したため **mentor 認証必須に変更済み**
- `apps/api/src/index.ts` で `/api/*` と `/checkin/*` の両方に `apiCors` +
  `requireAuthenticatedMentor` を適用している
- フロント側は checkin / admin / signage すべてが `/login` を持ち、`MeProvider`
  でセッションを取得する

### Better Auth と pnpm peer 解決

- Better Auth を入れると transitive で kysely が引き込まれる
- pnpm の peer dep 解決で `apps/api` 側の drizzle-orm が `kysely` フレーバーで
  resolve される一方、`packages/db` 側はノーフレーバーで resolve される
- 同じバージョンでも別ストアコピーになり、TypeScript が `SQLiteColumn` を
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

- miniflare の local D1 ストア先が変わってテーブルが空になる
- 対策: `wrangler.toml` 変更後は `pnpm --filter @tecnova/api db:apply:local`
  を再実行

### CORS とクロスオリジンクッキー

- 各フロント（3000 / 3001 / 3002）→ API（8787）は別オリジン
- `apps/api/src/index.ts` の cors は `TRUSTED_ORIGINS` を参照して
  許可オリジンを動的判定 + `credentials: true`。`TRUSTED_ORIGINS` は `/api/*` と
  `/checkin/*` の CORS、Better Auth の trustedOrigins の 3 か所で使われるので、
  **フロントを増やしたら必ずそのオリジンを追加する**（漏れると 401/403）
- フロントの `authClient` は `fetchOptions.credentials: 'include'` で
  Worker のクッキーを送信
- Better Auth の `signIn.social({ callbackURL })` には**絶対URLを渡す**
  （相対パスだと Better Auth が baseURL = ワーカーで解決してしまう、PR #10 修正）
- admin / API は同一親ドメイン配下の兄弟サブドメインに置くこと。別ドメインに分けると
  Cookie が third-party 扱いになり認証が壊れる

### 学生側スプシの列構成を変えるときはデプロイ順序が肝

- 現在の `participants` シートは A=事前登録ID / B=氏名 / C=ニックネーム / D=学年 /
  E=事前登録日 / F=内製ID / G=アクティベート日時 / H=アクティベート済（`A2:H` を読む）
- 新コードが旧レイアウトのスプシを読むと列マッピングがズレて読み書きが崩壊する。
  列を足す・動かすときは「メンテ枠確保 → スプシ更新 → D1 マイグレーション → backfill →
  API デプロイ → フロントデプロイ」の順で行う（フロントは Zod で新形式を必須にするため API が先）
- 氏名追加時（2026-05）の詳細手順とロールバック手順は git 履歴を参照：
  `git show 5f5c131:docs/handoff.md`
- 学生側スプシ ID は Secret 扱い（Public リポジトリ運用方針のため。`[vars]` に書かない）

### フロントの hooks / effect 変更は runtime で確認する

- checkin / admin / signage にはユニットテスト基盤が無く、type-check・Biome・コードレビューは
  React の無限再レンダーループのような runtime 不具合を取りこぼす
  （PR #44 で `useEffect` 内 setState が毎レンダー新規生成される派生値に依存し、loading 画面で
  無限ループした → `412b605` で修正）
- 取得状態・effect を触ったら、dev サーバで該当画面を開いてコンソールエラーを確認してから完了とする
- admin / checkin のデータ取得は `@tecnova/ui` の `useApiResource`
  （`packages/ui/src/hooks/use-api-resource.ts`）に統一済み。新しい画面もこれを使う

### フロントで `@tecnova/*` パッケージを使うとき

- 各アプリの `next.config.ts` の `transpilePackages` に追加する（現状 `@tecnova/shared` と
  `@tecnova/ui`）

### サイネージの YouTube 広告は埋め込み側で消せない

- 埋め込みプレーヤーは所有しない動画の広告を削除・スキップできない
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
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
YOUTUBE_API_KEY=<youtube data api key>
YOUTUBE_PLAYLIST_ID=<playlist id>
```

フロント側は `NEXT_PUBLIC_API_URL`（未設定時 `http://localhost:8787`）。

---

## 作業の進め方

- **ブランチ運用**：`main` には直接触れない。feature ブランチを切り、PR は `develop` に対して出す。
  本番反映は `develop` → `main` のリリース PR で行う
- **ミニマム・シンプル優先**：Phase 1.5 以降のものを先取りで作らない
- **API 最優先**：UI/UX 整えは最後
- **CLI 経由で初期化**：`create-next-app` 等を手書きで再現しない
- **小さい論理単位でコミット**：PR 内も複数コミットに分けて積み上げる
- **CLI ツールはローカル devDep**：wrangler 等をグローバルに入れない
- **Public リポジトリ運用**：シークレット類は `wrangler secret put` または
  Vercel 環境変数。`.env.example` には変数名のみ
- **設計 → 計画 → 実装**：大きめの作業は `docs/superpowers/specs/`（設計）と
  `docs/superpowers/plans/`（実装計画）に残してから着手している
- **Claude Code 用ツール**（`.claude/`）：
  - hooks：シークレットファイルへの書き込みブロック、編集後の Biome フォーマット
  - subagents：`workers-constraint-reviewer`（Workers 制約チェック）、
    `privacy-reviewer`（個人情報の保持範囲チェック）
  - skills：`create-migration`（Drizzle/D1 マイグレーション）、`pre-pr-check`
    （Biome + type-check + CI 対象外の `packages/shared` / `apps/api` テスト + シークレット/PII スキャン）
- **API のテスト**：`pnpm --filter @tecnova/api test`（`@cloudflare/vitest-plugin`。ローカルの D1 にマイグレーションを当てて `apps/api/src/lib` を直接テストする。各テストの前に `resetTables` で空にする）。`packages/shared` は `pnpm --filter @tecnova/shared test`。どちらも CI では走らないので PR 前に手元で実行する
