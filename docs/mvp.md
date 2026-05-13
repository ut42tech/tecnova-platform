# tecnova-platform MVP実装ガイド

| 項目                   | 内容                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| ドキュメントバージョン | v1.4                                                                     |
| 想定運用開始           | 2026年5月中旬                                                            |
| 関連ドキュメント       | [`requirements.md`](./requirements.md)（全体構想・将来構想を含む完全版） |

---

## 1. このドキュメントの目的

[`requirements.md`](./requirements.md) が「全体構想と将来も含む正典」であるのに対し、本ドキュメントは**最初の実装フェーズで何を作るか**だけに集中した実装ガイドである。

ここに書かれたものを作れば、テクノバながさきの運用開始に間に合う。書かれていないものは作らない。

**Claude Codeでの実装を想定**しており、各セクションは実装に直結する粒度で記述されている。

---

## 2. MVPゴール

**「子どもがiPadでチェックイン・チェックアウトでき、初回来場者は事前登録情報からアクティベートできる」状態を実現する。**

これが達成されれば、運用は始められる。活動ログ等のメンター業務は引き続き従来通りスプシ運用で並行し、Phase 1.5で実装していく。

---

## 3. スコープ

### 3.1 含むもの（MVPで実装）

✅ バックエンドAPI基盤（Hono on Cloudflare Workers）
✅ DB環境（Cloudflare D1 + Drizzle ORM）
✅ 4テーブルのスキーマとマイグレーション（participants / events / sessions / mentors）
✅ Google Sheets API連携（学生側スプシの読み書き）
✅ チェックインiPadアプリ（PWA・QR/バーコードスキャン）
✅ 「初めての方」フロー（一覧表示・選択・ID採番・スプシ書き戻し）
✅ 通常チェックイン/チェックアウト
✅ 管理画面（最小限：当日の来場状況・参加者一覧・メンター管理・ログイン）
✅ Google OAuth認証（Better Auth・許可リスト方式）

### 3.2 含まないもの（Phase 1.5以降）

⏭️ メンタースマホアプリ
⏭️ 活動ログ機能
⏭️ 活動カテゴリ・機材マスタ
⏭️ ログCSVエクスポート
⏭️ 教員側スプシとの自動同期
⏭️ 振り返りシートOCR
⏭️ 公開API
⏭️ 保護者向け機能
⏭️ オフライン対応

---

## 4. データモデル

### 4.1 Drizzleスキーマ

`packages/db/src/schema.ts` に以下を実装する。D1 は SQLite ベースなので `drizzle-orm/sqlite-core` を使う。

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// 参加者
export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(), // 例: '26001'
  preRegistrationId: text("pre_registration_id").unique().notNull(),
  nickname: text("nickname").notNull(),
  grade: text("grade").notNull(),
  // タイムスタンプは UTC の Unix epoch ms で保存し、表示時に JST 変換
  activatedAt: integer("activated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
});

// 開催日
export const events = sqliteTable("events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  date: text("date").unique().notNull(), // 'YYYY-MM-DD' (JST基準)
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// 来場セッション
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    participantId: text("participant_id")
      .references(() => participants.id)
      .notNull(),
    eventId: text("event_id")
      .references(() => events.id)
      .notNull(),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
    checkedOutAt: integer("checked_out_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    idxParticipantEvent: index("idx_sessions_participant_event").on(
      t.participantId,
      t.eventId,
    ),
    idxEventCheckedIn: index("idx_sessions_event_checkedin").on(
      t.eventId,
      t.checkedInAt,
    ),
  }),
);

// メンター（運営者）
export const mentors = sqliteTable("mentors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "mentor"] })
    .default("mentor")
    .notNull(),
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
});

// Better Auth が利用するテーブル（user / session / account / verification）は
// Better Auth CLI で SQLite/D1 用に自動生成。上記とは別管理。
```

**SQLite 固有の注意点**:

- 文字列の長さ制約は SQLite では強制されない。代わりに `packages/shared/src/schemas/` の Zod スキーマで長さ検証する
- `boolean` は内部的には `0`/`1` の INTEGER。Drizzle 経由では JS の `boolean` として扱える
- タイムスタンプは Unix epoch ms（INTEGER）で保存。`withTimezone` 概念はないが、保存は UTC、表示時に `Asia/Tokyo` で変換するルールで運用する
- `enum` は `text` の値域制約として表現される（マイグレーション SQL では CHECK 制約）
- 外部キー制約は D1 でデフォルト ON。`PRAGMA foreign_keys = ON;` 不要

### 4.2 ID採番ロジック

```typescript
// 例: 2026年度なら "26" + 連番（001から）
// D1 はインタラクティブ・トランザクションがないため、SELECT で直近IDを取得 →
// 計算 → INSERT の流れで実装。PK 衝突時は再採番リトライで対応する。

import { desc, like } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

async function generateNextParticipantId(
  db: DrizzleD1Database<typeof schema>,
): Promise<string> {
  const yearPrefix = String(new Date().getFullYear() % 100).padStart(2, "0"); // "26"
  const result = await db
    .select({ id: participants.id })
    .from(participants)
    .where(like(participants.id, `${yearPrefix}%`))
    .orderBy(desc(participants.id))
    .limit(1);

  if (result.length === 0) {
    return `${yearPrefix}001`;
  }

  const lastNum = parseInt(result[0].id.slice(2), 10);
  const nextNum = String(lastNum + 1).padStart(3, "0");
  return `${yearPrefix}${nextNum}`;
}
```

注意点:

- D1 はインタラクティブ・トランザクションを持たないため、PG時代のような「SELECT → INSERT を同一トランザクションで保護」はできない
- 同時アクティベートはほぼ起こらない（運用上、複数の子が同時タップする確率は低い）
- **現行実装では採番衝突時の自動リトライは未実装**。`UNIQUE constraint failed: participants.id` が出た場合は再試行（手動）で回復する。将来的には最大3回の自動リトライを実装予定（`apps/api/src/lib/checkin.ts` の TODO）
- 年度判定は会計年度ではなく西暦下2桁とする

### 4.3 events自動生成ロジック

```typescript
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

async function getOrCreateTodayEvent(
  db: DrizzleD1Database<typeof schema>,
): Promise<string> {
  // JST で「今日」を判定
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // 'YYYY-MM-DD'

  const [event] = await db
    .insert(events)
    .values({ date: today })
    .onConflictDoNothing()
    .returning();

  if (event) return event.id;

  const [existing] = await db
    .select()
    .from(events)
    .where(eq(events.date, today))
    .limit(1);
  return existing.id;
}
```

タイムゾーン注意: Workersのデフォルトタイムゾーンはサーバーロケーションに依存しないUTC。JSTで「今日」を判定する必要があるので、上記のように明示的に変換する。SQLite の `onConflictDoNothing` も Drizzle の同名メソッドで動作する（`UNIQUE` 制約に対する `ON CONFLICT DO NOTHING`）。

---

## 5. 学生側スプシ仕様

### 5.1 シート構成

シート名: `participants`

| 列  | カラム名           | 型       | 説明                               | 編集権限     |
| --- | ------------------ | -------- | ---------------------------------- | ------------ |
| A   | 事前登録ID         | text     | PRE-2026-0001 形式                 | 教員側       |
| B   | ニックネーム       | text     |                                    | 教員側       |
| C   | 学年               | text     | 小1, 小4, 中2 等                   | 教員側       |
| D   | 事前登録日         | date     | YYYY-MM-DD                         | 教員側       |
| E   | 内製ID             | text     | 26001 等（バックエンドが書き込み） | バックエンド |
| F   | アクティベート日時 | datetime | YYYY-MM-DD HH:mm:ss（同上）        | バックエンド |
| G   | アクティベート済   | boolean  | TRUE/FALSE（同上）                 | バックエンド |

1行目はヘッダー、2行目以降がデータ。

### 5.2 バックエンドからのアクセス方法

**読み取り**:

- `GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/participants!A2:G` で全データ取得
- レスポンスを配列にパースし、Gが `FALSE` または空のレコードをフィルタ
- 5秒キャッシュ（Workers Cache APIまたはmoduleスコープのMap）

**書き込み**:

- アクティベート時、対象行のE/F/G列を更新
- 行番号は読み取り時のインデックスから特定（Aの順序に依存するためソート不可）
- `PUT https://sheets.googleapis.com/v4/spreadsheets/{id}/values/participants!E{row}:G{row}?valueInputOption=USER_ENTERED` で3列まとめて更新
- リクエストボディ: `{ "values": [["26001", "2026-05-15 09:32:15", "TRUE"]] }`

### 5.3 サービスアカウント設定

Google Cloud Consoleで：

1. プロジェクト作成
2. Sheets APIを有効化
3. サービスアカウント作成
4. JSON鍵をダウンロード
5. 鍵の `client_email` を学生側スプシに「編集者」として共有
6. **JSON鍵を base64 エンコード**して Cloudflare Workers の Secrets に `GOOGLE_SERVICE_ACCOUNT_KEY` として登録：

   ```bash
   # 本番（Cloudflare 上の Secret）
   base64 -i ~/path/to/service-account.json | tr -d '\n' | pbcopy
   pnpm --filter @tecnova/api exec wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
   # プロンプトで cmd+v でペースト

   # ローカル開発（apps/api/.dev.vars）
   echo "GOOGLE_SERVICE_ACCOUNT_KEY=$(base64 -i ~/path/to/service-account.json | tr -d '\n')" > apps/api/.dev.vars
   ```

7. **学生側スプシID も Secret として登録**（`GOOGLE_SHEETS_ID`）。Public リポジトリへの露出を避けるため `wrangler.toml` の `[vars]` ではなく Secret 扱い。

   ```bash
   pnpm --filter @tecnova/api exec wrangler secret put GOOGLE_SHEETS_ID
   echo 'GOOGLE_SHEETS_ID=1AbCdEf...' >> apps/api/.dev.vars
   ```

### 5.5 参加者 Drive フォルダの自動作成（GAS webhook）

アクティベート成功時、参加者ごとの作品保存用 Google Drive フォルダを GAS（Apps
Script）の Web App エンドポイント経由で作成する。

- Workers 側は `c.executionCtx.waitUntil()` でレスポンス送信後に POST する
  （実装: `apps/api/src/lib/drive-folder.ts` / `apps/api/src/routes/checkin.ts` の
  `queueDriveFolderCreation`）。Drive 作成の失敗はチェックインを止めない。
- GAS 側は `secret` 一致を確認してから Drive フォルダを `participantId_nickname` で作成し、
  `{ ok: true, folderId, folderName, reused }` を返す。
- 必要な Secret は 2 つ:

  | 変数名                     | 説明                                                                 |
  | -------------------------- | -------------------------------------------------------------------- |
  | `GAS_DRIVE_WEBHOOK_URL`    | GAS Web App の `/exec` URL                                           |
  | `GAS_DRIVE_WEBHOOK_SECRET` | GAS 側と共有する任意のシークレット文字列（リクエストボディに同梱する） |

  両方が未設定の場合は機能ごと無効化される（`url && secret` が揃わないと no-op）。
  片方だけ設定されている場合は `console.warn` を出してスキップする（fail-closed）。

**なぜ base64 なのか**: 生 JSON を `.dev.vars` に書くと、dotenv パーサが `private_key` 内の `\n` エスケープを実改行に変換してしまい、Worker 側で `JSON.parse` が「Bad control character」で失敗する。base64 でラップしておけば dotenv は手を加えず、コード側で `atob` → `JSON.parse` の順に処理できる。

### 5.4 Workers環境でのGoogle Sheets API実装

`googleapis` パッケージはNode.js依存のためWorkersで動かない。**Web Crypto APIで自前JWT生成 + fetch直叩き**で対応する。実装は `packages/shared/src/google-sheets.ts` を参照。

公開している関数:

| 関数                                                       | 用途                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `getCachedAccessToken(encodedKey)`                         | サービスアカウントJWTでアクセストークンを取得（1時間キャッシュ） |
| `fetchSheetRows(encodedKey, spreadsheetId, range)`         | 指定レンジを2次元配列で読む                                      |
| `updateSheetRow(encodedKey, spreadsheetId, range, values)` | `valueInputOption=USER_ENTERED` で書き込み                       |

**重要な設計判断**:

- 第1引数は **base64 エンコード済みのサービスアカウントJSON文字列**を受け取る。コード内で `atob` → `JSON.parse` の順にデコードする。`.dev.vars` の dotenv パーサが `\n` を実改行に変換して `JSON.parse` が壊れる問題を回避するため
- アクセストークンはモジュールスコープでキャッシュ（`expiresAt > now + 60s` の条件で再利用）。Workers インスタンスがリサイクルされたら自然に再生成される
- 鍵の PEM ヘッダー除去 → `crypto.subtle.importKey('pkcs8', ...)` → RS256 署名 → JWT 組み立て、の順
- エラー時は HTTP ステータス + 本文を含む例外を投げる（呼び出し側で saga の補償処理を判断するため）

**初週でPoCを完了させること。** これがハマると全体が止まる。動作確認は `apps/api` の `/sheets/health` エンドポイント（参加者シートの行数を返す）で行える。

---

## 6. APIエンドポイント仕様

すべてのレスポンスは JSON。エラー時は HTTP 4xx/5xx + `{ "error": "ERROR_CODE", "message": "..." }`。

### 6.1 受付端末用（`/checkin/*`・メンター認証必須）

iPad 受付端末は会場の運営者（メンター）端末である前提に変更したため、`/checkin/*`
配下は `/api/*` と同じ Cookie ベース認証で守る。子どもは受付に立つメンターの端末を
通してチェックインする運用に倒し、認証なしで誰でも叩けるエンドポイントは
`/health` 系のみとした。

CORS / 認証ミドルウェアは `apps/api/src/index.ts` で `/api/*` と `/checkin/*` の
両方に対して `TRUSTED_ORIGINS` ベースの cors + `requireAuthenticatedMentor` を
適用している。

#### `GET /checkin/pre-registered`

未アクティベートの事前登録者一覧を返す。

**リクエスト**: なし

**レスポンス**:

```json
{
  "participants": [
    {
      "preRegistrationId": "PRE-2026-0042",
      "nickname": "たくや",
      "grade": "小4",
      "registeredAt": "2026-04-15"
    }
  ]
}
```

注: 登録日新しい順にソート。

#### `POST /checkin/activate`

事前登録者をアクティベートし、内製IDを発行、初回チェックインを実行する。

**リクエスト**:

```json
{ "preRegistrationId": "PRE-2026-0042" }
```

**レスポンス（成功）**:

```json
{
  "participantId": "26001",
  "nickname": "たくや",
  "grade": "小4",
  "checkedInAt": "2026-05-15T09:32:15+09:00"
}
```

**エラー**:

- `ALREADY_ACTIVATED`: 既にアクティベート済み
- `NOT_FOUND`: 事前登録IDが存在しない
- `SHEETS_WRITE_FAILED`: スプシ書き戻し失敗

**サーバー側処理順（D1 saga パターン）**:

D1 にはインタラクティブ・トランザクションがないため、「DB書き込み → スプシ書き戻し → 失敗時は補償処理」のフローで原子性に近い保証を作る。

1. 事前登録IDから当該行をスプシで検索（または読み取りキャッシュから）。なければ `NOT_FOUND`
2. 内製ID採番（`generateNextParticipantId`）
3. event_id を取得 or 作成（`getOrCreateTodayEvent`）
4. **`db.batch([...])` で原子的に書き込み**:
   - `INSERT participants`（id, preRegistrationId, nickname, grade）
   - `INSERT sessions`（participantId, eventId, checkedInAt）
5. スプシ書き戻し（E/F/G列を更新）
6. **スプシ書き戻し失敗時は補償処理**:
   - `db.batch([...])` で `DELETE sessions` → `DELETE participants` を実行
   - クライアントには `SHEETS_WRITE_FAILED` を返す
7. すべて成功した場合のみレスポンス返却

**補償処理が失敗するレアケース**: 補償の DELETE 自体が失敗した場合は、participants / sessions に「DBには登録済みだがスプシ未反映」のゴーストレコードが残る。エラーログに internal ID を残し、運用者が管理画面（または直接D1コンソール）から手動修復する。MVP ではここまでの考慮で十分。

**PK 衝突時のリトライ**: 現行実装では未対応。`INSERT participants` で `UNIQUE constraint failed: participants.id` が出た場合はエラーを返し、運用側で再試行する。安定運用に向けてステップ2から最大3回の自動リトライを実装予定。

#### `POST /checkin/sessions/check-in`

QR/バーコードスキャンによるチェックイン（既存参加者）。

**リクエスト**:

```json
{ "participantId": "26001" }
```

**レスポンス（成功）**:

```json
{
  "sessionId": "uuid-...",
  "nickname": "たくや",
  "checkedInAt": "2026-05-15T09:32:15+09:00"
}
```

**エラー**:

- `ALREADY_CHECKED_IN`: 既にチェックイン中
- `NOT_FOUND`: 参加者が存在しない・無効

**サーバー側処理**:

1. participants 存在確認 + active=true 確認
2. 当日の events を取得 or 作成
3. 当日の同じparticipantのsessionsで未チェックアウトがあればエラー
4. sessions レコード作成
5. レスポンス返却

#### `POST /checkin/sessions/check-out`

QR/バーコードスキャンによるチェックアウト。

**リクエスト**:

```json
{ "participantId": "26001" }
```

**レスポンス（成功）**:

```json
{
  "nickname": "たくや",
  "checkedInAt": "2026-05-15T09:32:15+09:00",
  "checkedOutAt": "2026-05-15T12:45:00+09:00",
  "stayDurationMinutes": 192
}
```

**エラー**:

- `NOT_CHECKED_IN`: チェックインしていない

**サーバー側処理**:

1. 当日の同じparticipantの未チェックアウトsessionsを検索
2. なければエラー
3. checked_out_at = now で更新
4. レスポンス返却

#### `POST /checkin/scan`

QR/バーコードスキャン用統合エンドポイント。スキャン値の形式から処理を自動判定。

**リクエスト**:

```json
{ "scanValue": "26001" }
```

**動作**:

- `26001` 形式（5桁・年度2桁+連番）→ 当日チェックイン状態を確認し、未チェックインならcheck-in、チェックイン中ならcheck-outを実行
- それ以外 → `INVALID_SCAN_VALUE` エラー

**レスポンス**: チェックイン or チェックアウトと同じ。`action: "check_in" | "check_out"` を含める。

#### `GET /checkin/history/today`

当日の受付履歴（チェックイン中・退室済を含む全セッション）。受付端末側で「QR が
手元にない参加者の状態確認」や「閉場時の一括チェックアウト」導線で使う。

**レスポンス**: `GET /api/sessions/today` と同じ shape（`event` / `sessions` /
`summary`）。共通スキーマ `todaySessionsResponseSchema` を共有。

#### `POST /checkin/history/check-out-bulk`

複数参加者を一括チェックアウトする。すでに退室済みの参加者は対象外として扱い、
実際に更新できたセッションだけをレスポンスに含める。

**リクエスト**:

```json
{ "participantIds": ["26001", "26002"] }
```

**レスポンス**:

```json
{
  "checkedOutAt": "2026-05-15T12:30:00+09:00",
  "checkedOutCount": 2,
  "participants": [
    {
      "participantId": "26001",
      "nickname": "たくや",
      "checkedInAt": "2026-05-15T09:32:15+09:00",
      "checkedOutAt": "2026-05-15T12:30:00+09:00",
      "stayDurationMinutes": 178
    }
  ]
}
```

#### `GET /checkin/participants/search`

ニックネーム部分一致で active な参加者を検索する。マニュアル入力画面の
「名前で探す」モードで使う。`/api/participants` と違って admin 権限不要・
ページネーションなし・active=true のみ。

**クエリ**: `?q=<1〜40文字>`

**レスポンス**:

```json
{
  "participants": [
    { "id": "26001", "nickname": "たくや", "grade": "小4" }
  ]
}
```

#### `GET /checkin/participants/:participantId`

受付プロフィール画面。QR/手入力で確定した直後、まずこのエンドポイントを叩き、
参加者の通算来場・直近来場日・現在の在場状態をまとめて取得する。フロントは
`current.nextAction` を見て表示する操作ボタンを `check_in` / `check_out` の
一方に絞る。

**レスポンス**:

```json
{
  "participant": {
    "id": "26001", "nickname": "たくや", "grade": "小4",
    "activatedAt": "2026-04-20T09:10:00+09:00"
  },
  "stats": {
    "visitCount": 5,
    "lastVisitedAt": "2026-05-08T14:00:00+09:00",
    "totalStayDurationMinutes": 920
  },
  "current": {
    "isPresent": false,
    "checkedInAt": null,
    "nextAction": "check_in"
  },
  "sessions": [
    {
      "sessionId": "uuid-...",
      "checkedInAt": "2026-05-08T13:02:00+09:00",
      "checkedOutAt": "2026-05-08T15:10:00+09:00",
      "stayDurationMinutes": 128,
      "isPresent": false
    }
  ]
}
```

#### `POST /checkin/participants/:participantId/attendance`

プロフィール画面の「チェックイン」「チェックアウト」ボタンから呼ばれる実行
エンドポイント。サーバーが現在の在場状態を再判定して、`check_in` / `check_out`
のどちらかを実行する。`scanValue` を URL パラメータから読む `/checkin/scan` の
別表現と考えればよい。

**レスポンス**: `/checkin/scan` と同じ `scanResponseSchema`。

### 6.2 認証あり（管理画面用）

#### `GET /api/sessions/today`

当日の来場状況一覧。

**レスポンス**:

```json
{
  "event": { "id": "uuid-...", "date": "2026-05-15" },
  "sessions": [
    {
      "sessionId": "uuid-...",
      "participantId": "26001",
      "nickname": "たくや",
      "grade": "小4",
      "checkedInAt": "2026-05-15T09:32:15+09:00",
      "checkedOutAt": null,
      "isPresent": true
    }
  ],
  "summary": {
    "totalCheckedIn": 12,
    "currentlyPresent": 8,
    "checkedOut": 4
  }
}
```

#### `GET /api/participants`

参加者一覧（全員、ページネーション対応）。

**クエリパラメータ**:

- `page` (default: 1)
- `limit` (default: 50)
- `search` (任意・ニックネーム部分一致)

**レスポンス**:

```json
{
  "participants": [
    {
      "id": "26001",
      "nickname": "たくや",
      "grade": "小4",
      "activatedAt": "2026-05-15T09:32:15+09:00",
      "active": true
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 42 }
}
```

#### `GET /api/mentors` / `POST /api/mentors` / `PATCH /api/mentors/:id`

メンター（運営者）の一覧・追加・編集（admin権限必須）。

**POSTリクエスト**:

```json
{ "email": "mentor@example.com", "name": "山田太郎", "role": "mentor" }
```

#### `GET /api/pre-registrations` / `POST /api/pre-registrations` / `DELETE /api/pre-registrations/:preRegistrationId`

学生側スプシ上の「未アクティベート事前登録者」を管理する admin 専用 API。

- `GET`: 未アクティベート一覧を返す
- `POST`: `preRegistrationId` を自動採番して行を追加する
- `DELETE`: 未アクティベート行のみ削除（アクティベート済みは 409）

**POSTリクエスト**:

```json
{ "nickname": "たくや", "grade": "小4", "registeredAt": "2026-05-05" }
```

### 6.3 認証エンドポイント（Better Auth提供）

- `GET /api/auth/session` セッション情報取得
- `POST /api/auth/sign-in/social` Google OAuth開始
- `GET /api/auth/callback/google` OAuth コールバック
- `POST /api/auth/sign-out` ログアウト

許可リスト判定: Better Authの `signIn` フックで mentors テーブルのemailを照合し、存在しないか `active=false` ならエラー。

---

## 7. 画面仕様

### 7.1 チェックインiPadアプリ（apps/checkin）

iPad は受付メンターの端末。トップ画面はカメラを常時起動した QR スキャナ + 横の
ショートカット（初めての人 / 受付りれき / マニュアル入力）で構成し、子どもが
個別のフォームを操作する想定はしない。

#### 7.1.1 トップ画面（QR + ショートカット 3 つ）

- 主画面はカメラビュー（`@zxing/browser` の `BrowserMultiFormatReader.decodeFromVideoDevice`）
- 5 桁の内製ID形式（`PARTICIPANT_ID_PATTERN`）にマッチした値だけを採用
- 認識成功で即 `/reception/participants/[id]` に遷移し、controls.stop() で二重検出を防ぐ
- カメラ再起動 / カメラ切り替えボタンを提供（複数 videoDevice 切り替え対応）
- 右カラムに 3 つの ActionPanel:
  - `/first-time` 初めての人 → 事前登録者一覧
  - `/history` 受付りれき → 当日履歴 + 一括チェックアウト
  - `/manual` マニュアル入力 → ID/名前検索

#### 7.1.2 受付プロフィール画面 `/reception/participants/[id]`

- QR 認識直後 or マニュアル入力からの確定後に到達する**正規の確認画面**
- `GET /checkin/participants/:id` で profile / stats / current / sessions を取得
- 上部に大きく「○○さん（学年）」「あなたのIDは 26001 です」を表示
- 大きな単一の実行ボタン（`current.nextAction` に応じて「チェックイン」/「チェックアウト」）
  - タップで `POST /checkin/participants/:id/attendance` を呼ぶ
  - レスポンス（`action: 'check_in' | 'check_out'`）に応じて結果サマリを表示
- 通算来場回数・直近来場日・累計滞在時間と、活動カレンダーのタイル表示（`attendanceIntensityClasses`）

#### 7.1.3 初めての方一覧画面 `/first-time`

- 未アクティベートの事前登録者をカード表示（ニックネーム＋学年）
- 登録日新しい順
- カードタップ → `POST /checkin/activate` 呼び出し → ID 表示画面 → トップ復帰
- ロード中はスケルトン表示

#### 7.1.4 受付履歴画面 `/history`

- `GET /checkin/history/today` で当日のセッション一覧を取得
- 各行に「現在在場 / 退室済」バッジ、チェックイン時刻、滞在時間を表示
- 在場中の参加者を選択して「一括チェックアウト」を確認ダイアログ越しに実行（`POST /checkin/history/check-out-bulk`）
- 行タップで `/reception/participants/[id]` に遷移

#### 7.1.5 マニュアル入力画面 `/manual`

- 「ID で入力」「名前で探す」のタブ切替
- ID モード: 5 桁の手入力フォーム → `/reception/participants/[id]` へ遷移
- 名前モード: `GET /checkin/participants/search?q=...` で部分一致検索 → 候補タップで遷移

#### 7.1.6 ログイン / 設定 / ガイドライン

- `/login`: Google OAuth ボタンのみ。Better Auth の `signIn.social` を呼ぶ
- `/settings`: ログアウト導線、現在のメンター情報表示
- `/guideline`: 子ども向けの利用ガイド（PWA 内導線）

#### 7.1.7 PWA 設定

- `app/manifest.ts` でホーム画面追加可能に（`display: 'fullscreen'`）
- iOSアクセスガイド機能でアプリ固定運用（運用マニュアル別途）
- HTTPS必須（Vercelデプロイで自動対応）

### 7.2 管理画面（apps/admin）

#### 7.2.1 ログイン画面

- 「Googleでログイン」ボタンのみ
- 許可リスト外のアカウントの場合は「アクセス権限がありません」と表示

#### 7.2.2 ダッシュボード

- ヘッダー: ログインユーザー名、ログアウト
- カード: 「現在の来場者数」「今日の総チェックイン数」「チェックアウト済」
- 当日のセッション一覧テーブル（リロードで更新）
  - ID / ニックネーム / 学年 / チェックイン時刻 / チェックアウト時刻 / 現在状態

#### 7.2.3 参加者一覧

- 検索ボックス（ニックネーム）
- テーブル: ID / ニックネーム / 学年 / アクティベート日 / 状態
- ページネーション
- MVPでは閲覧のみ。編集はPhase 1.5

#### 7.2.4 メンター管理（admin権限のみ）

- 一覧: メアド / 名前 / ロール / 状態
- 追加: メアド・名前・ロール入力フォーム
- 編集: ロール変更・active切替

#### 7.2.5 事前登録管理（admin権限のみ）

- 一覧: 事前登録ID / ニックネーム / 学年 / 事前登録日
- 追加: ニックネーム・学年・事前登録日を入力（IDは `PRE-YYYY-NNNN` で自動採番）
- 削除: 未アクティベート行のみ削除

---

## 8. セットアップ手順

### 8.1 必要なアカウント・サービス

- GitHubアカウント
- Cloudflareアカウント（Workers + D1用）
- Vercelアカウント（フロント2つ用：checkin / admin）
- Google Cloud Platformアカウント（Sheets API + OAuth用）

### 8.2 初期セットアップ手順

```bash
# 1. モノレポ初期化
mkdir tecnova-platform && cd tecnova-platform
git init
pnpm init

# 2. workspace 設定
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

# 3. Turborepo & Biome 導入
pnpm add -D -w turbo @biomejs/biome
pnpm biome init

# 4. apps/api 作成（Hono on Cloudflare Workers）
pnpm create hono@latest apps/api -- --template cloudflare-workers --install --pm pnpm

# 5. apps/checkin 作成（Next.js）
cd apps && pnpm create next-app@latest checkin --typescript --tailwind --app --no-src-dir --import-alias "@/*"
pnpm create next-app@latest admin --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd ..

# 6. packages/db, shared, ui, auth 作成
mkdir -p packages/{db,shared,ui,auth}/src
for pkg in db shared ui auth; do
  cd packages/$pkg && pnpm init && cd ../..
done

# 7. 各種依存追加
pnpm --filter @tecnova/db add drizzle-orm
pnpm --filter @tecnova/db add -D drizzle-kit
pnpm --filter @tecnova/api add @cloudflare/workers-types
pnpm --filter @tecnova/shared add zod
pnpm --filter @tecnova/auth add better-auth
```

### 8.3 turbo.json 雛形

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {},
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

### 8.4 Cloudflare D1 / Vercel接続

#### Cloudflare D1

```bash
cd apps/api
npx wrangler login
npx wrangler d1 create tecnova-db
# 出力された database_id を wrangler.toml に追加
```

`apps/api/wrangler.toml`:

```toml
name = "tecnova-api"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "tecnova-db"
database_id = "<d1-database-id>"
migrations_dir = "../../packages/db/drizzle"

[vars]
BETTER_AUTH_URL = "https://api.example.workers.dev"
TRUSTED_ORIGINS = "https://admin.example.com"

# 以下はSecretsで設定（wrangler secret put）
# GOOGLE_SERVICE_ACCOUNT_KEY     ← base64 エンコード済みのサービスアカウントJSON
# GOOGLE_SHEETS_ID               ← 学生側スプシID（Public リポジトリへの露出を避けるため Secret 扱い）
# GOOGLE_OAUTH_CLIENT_ID
# GOOGLE_OAUTH_CLIENT_SECRET
# BETTER_AUTH_SECRET
```

Workers コードからは `c.env.DB`（型は `D1Database`）でアクセスし、Drizzle に渡す：

```typescript
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@tecnova/db/schema";

// Hono context 内で
const db = drizzle(c.env.DB, { schema });
```

#### Drizzleマイグレーション

```bash
cd packages/db
# drizzle.config.ts を作成
pnpm drizzle-kit generate  # SQLマイグレーション生成（packages/db/drizzle/ に出力）

# ローカル D1（Miniflare）に適用
cd ../../apps/api
npx wrangler d1 migrations apply tecnova-db --local

# 本番 D1 に適用
npx wrangler d1 migrations apply tecnova-db --remote
```

`packages/db/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // マイグレーション SQL の生成のみ。適用は wrangler d1 migrations apply で行う
});
```

#### Vercelデプロイ

- GitHubリポジトリと連携
- 各 `apps/checkin`、`apps/admin` を別プロジェクトとしてデプロイ
- 環境変数で `NEXT_PUBLIC_API_URL` を設定

### 8.5 Google Cloud設定

#### Sheets API

1. プロジェクト作成
2. Sheets APIを有効化
3. サービスアカウント作成 + JSON鍵ダウンロード
4. 鍵の `client_email` を学生側スプシに編集者として共有
5. JSON鍵を base64 エンコードして `wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY` で登録
   （例: `base64 -i service-account.json | tr -d '\n'`）

#### OAuth (Better Auth用)

1. OAuth同意画面を設定（外部・テスト中はテストユーザー登録）
2. OAuth 2.0 クライアントID作成（タイプ: ウェブアプリケーション）
3. 承認済みのリダイレクトURI: `https://api.example.workers.dev/api/auth/callback/google`
4. `wrangler secret put GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`

---

## 9. 実装順序

### W1: 基盤構築週

| 日      | タスク                                                                     |
| ------- | -------------------------------------------------------------------------- |
| Day 1-2 | モノレポ初期化、各appsの雛形作成、Biome/Turborepo設定、GitHub連携          |
| Day 3   | Drizzleスキーマ定義、D1作成、ローカルD1（Miniflare）にマイグレーション適用 |
| Day 4   | Hono on Workers疎通、D1バインディング確認、`/health`エンドポイント         |
| Day 5   | **Google Sheets API疎通PoC（読み取り＋書き込み）。ここが最大の山場**       |
| Day 6-7 | 「初めての方」フロー実装（API + チェックインiPad画面）                     |

### W2: 機能実装週

| 日     | タスク                                                           |
| ------ | ---------------------------------------------------------------- |
| Day 8  | 通常チェックイン/チェックアウトAPI実装、QRスキャン部分実装       |
| Day 9  | チェックインiPadアプリ完成、PWA化、iPad実機テスト                |
| Day 10 | 管理画面ダッシュボード・参加者一覧実装                           |
| Day 11 | Better Auth組み込み、Google OAuth + 許可リスト、メンター管理画面 |
| Day 12 | E2Eテスト、エッジケース対応、運用マニュアル作成                  |
| Day 13 | リハーサル（実際のスプシで疎通）                                 |
| Day 14 | 本番リリース、待機                                               |

### Phase 1.5（運用開始後・並行実装）

- メンタースマホアプリ
- 活動ログ機能（`activity_logs` / `activity_categories` / `equipment` テーブル追加）
- ログCSVエクスポート

---

## 10. 動作確認チェックリスト

### 10.1 ローンチ判定基準（最低限のGo判定）

> 進捗メモ（2026-05-13時点）: iPad実機での動作確認は完了。受付プロフィール画面 /
> 履歴 / 一括チェックアウト / マニュアル入力までフロント実装済み。本番運用
> リハーサル時にチェックリストを最終確定する。

#### チェックイン基盤

- [ ] iPadのSafariでチェックインアプリにアクセスできる
- [ ] PWA化されホーム画面に追加できる
- [ ] iOSアクセスガイドでアプリ固定できる
- [ ] カメラ起動とQR/バーコード読み取りが動作する

#### 「初めての方」フロー

- [ ] iPadから「初めての方」をタップすると未アクティベート一覧が表示される
- [ ] スプシに登録された事前登録者が登録日新しい順に並ぶ
- [ ] カードをタップするとアクティベートされ、内製IDが画面に表示される
- [ ] 内製DBに participants と sessions レコードが作成される
- [ ] スプシのE/F/G列が正しく更新される
- [ ] アクティベート済みの参加者は次回以降一覧に表示されない

#### 通常チェックイン/アウト

- [ ] アクティベート済み参加者のIDをQR/バーコードで読み取れる
- [ ] 初回スキャンでチェックイン、2回目スキャンでチェックアウトされる
- [ ] チェックアウト時に滞在時間が表示される
- [ ] events テーブルにその日のレコードがなければ自動生成される

#### 管理画面

- [ ] Google OAuthでログインできる
- [ ] 許可リスト外のアカウントは弾かれる
- [ ] ダッシュボードで当日の来場状況が見える
- [ ] 参加者一覧でアクティベート済みの全員が見える
- [ ] adminロールでメンター追加・編集ができる

#### 運用支援

- [ ] Wi-Fi切断時のフォールバック手順が運営側に共有されている
- [ ] エリアマネージャーが学生側スプシへの転記方法を理解している
- [ ] 教員陣にスプシのアクティベート状況が見えることが共有されている

### 10.2 既知の制約（運用開始後の注意点）

- 当日朝に追加された事前登録者は反映されない可能性がある（5秒キャッシュ＋スプシ手作業転記の遅延）
- Wi-Fi切断時はチェックイン業務が一時停止する
- 同時アクティベートでID採番衝突が起きた場合はエラーになる（現行は手動再試行で回復）
- 活動ログ記入は引き続き従来通りスプシ手作業（Phase 1.5まで）
- スプシ書き戻し失敗時はDBもロールバックするため、ユーザーに再試行を求める

### 10.3 2026-05-13時点の残タスク（MVP仕上げ）

- 受付プロフィール画面（`/reception/participants/[id]`）の本番リハーサル
- 同時アクティベート時の採番衝突リトライ実装（`apps/api/src/lib/checkin.ts` の TODO）
- 運用手順の確定（Wi-Fi断フォールバック、当日担当オペレーション）
- 昨年度データのD1反映（匿名化済みデータのみ、participants/events/sessions の整合確認）

---

## 11. トラブルシュート

### 11.1 Better Auth on Workers でハマったら

**症状**: 33秒ハング、503エラー、`Network connection lost`

**対応**:

- `ctx.waitUntil(...)` を必ず使う（レスポンス送信後のバックグラウンドタスクを完了させるため）
- リクエスト毎にBetter Auth instanceを生成する（middleware内で）
- 詳細は Honoの公式ドキュメント `https://hono.dev/examples/better-auth-on-cloudflare` を参照

### 11.2 Google Sheets APIが動かない

**症状**: `googleapis` パッケージのインポートエラー、Workers環境で動かない

**対応**:

- `googleapis` は使わず、`fetch` + Web Crypto APIで自前JWT生成（本書5.4節参照）
- アクセストークンは1時間有効、モジュールスコープでキャッシュして使い回す
- サービスアカウント鍵を平文 JSON のまま `.dev.vars` に置かない。base64 エンコードして保持し、Worker 側で `atob` → `JSON.parse` でデコードする

### 11.3 D1 関連の落とし穴

**症状**: `D1_ERROR: no such table: ...`

**対応**:

- `wrangler d1 migrations apply tecnova-db --local` を流し忘れているケースが大半
- `wrangler.toml` の `[[d1_databases]]` ブロックの `database_id` が本番DBと一致しているか確認
- ローカル開発時は `--local` フラグ、本番反映時は `--remote` フラグの付け間違いに注意

**症状**: `Error: D1_ERROR: A prepared SQL statement must contain only one statement.`

**対応**:

- D1 では1ステートメント単位でしか実行できない。複数ステートメントを流したい場合は `db.batch([...])` を使う
- インタラクティブ・トランザクション（begin/commit を JS から制御）はサポートされない。本書 6.1節「アクティベート処理」のような saga パターンで補償処理ベースに設計する

**症状**: `UNIQUE constraint failed: participants.id`

**対応**:

- 同時アクティベートで採番が衝突した。`generateNextParticipantId` から再実行するリトライ（最大3回）を実装する

### 11.4 iPadのカメラが動かない

**症状**: カメラAPIが拒否される

**対応**:

- HTTPSであることを確認（Vercelデプロイなら自動）
- iOS Safariの設定でカメラ許可を確認
- `getUserMedia` のpermission stateを明示的にチェック

### 11.5 Drizzleマイグレーションが D1 に反映されない

**症状**: `wrangler d1 migrations apply` 実行後にスキーマが変わらない

**対応**:

- `wrangler d1 migrations list tecnova-db --local`（または `--remote`）で適用済みマイグレーションを確認
- `packages/db/drizzle/` に SQL が生成されているか確認（生成は `pnpm --filter @tecnova/db db:generate`）
- `wrangler.toml` の `migrations_dir` パスが `apps/api` から見て正しいか確認（`../../packages/db/drizzle`）
- ローカルと本番の D1 は完全に独立。ローカルで動作確認後、本番には別途 `--remote` で適用する

---

## 12. このドキュメントの使い方

- 開発中は本書を見ながら実装する
- 仕様変更が発生した場合、本書を更新してからコード修正する（ドキュメント先行）
- Phase 1.5へ移行する際は、本書のスコープ外項目を実装ガイドとして別ドキュメントに展開する
- 全体構想・設計判断の根拠は [`requirements.md`](./requirements.md) を参照
