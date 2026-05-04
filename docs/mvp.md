# tecnova-platform MVP実装ガイド

| 項目                   | 内容                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| ドキュメントバージョン | v1.2                                                                     |
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
- 同時アクティベートはほぼ起こらない（運用上、複数の子が同時タップする確率は低い）が、INSERT 時に PK 重複エラー（`UNIQUE constraint failed`）が出たら採番→挿入をリトライする
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

### 6.1 認証なし（チェックインiPad用）

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

**PK 衝突時のリトライ**: `INSERT participants` で `UNIQUE constraint failed: participants.id` が出た場合（同時アクティベートで採番が被った場合）は、ステップ2から最大3回リトライする。

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

### 6.3 認証エンドポイント（Better Auth提供）

- `GET /api/auth/session` セッション情報取得
- `POST /api/auth/sign-in/social` Google OAuth開始
- `GET /api/auth/callback/google` OAuth コールバック
- `POST /api/auth/sign-out` ログアウト

許可リスト判定: Better Authの `signIn` フックで mentors テーブルのemailを照合し、存在しないか `active=false` ならエラー。

---

## 7. 画面仕様

### 7.1 チェックインiPadアプリ（apps/checkin）

#### 7.1.1 トップ画面（手入力 + QR切替）

- デフォルトは 5 桁の手入力フォーム（`pattern="\d{5}"` で数字のみ）
- フォーム下に「QRコードで読み取る（試験運用）」ボタン → カメラビューに切替
- カメラビューでは「手入力に戻る」ボタンで元のフォームに復帰
- 下部に「初めての方はこちら」ボタン
- QR 認識時は **即時 API を叩かず確認画面を経由**（誤読・誤タップ対策）
  - 「この ID で合っていますか？」+ 大きく ID 表示 + 「やり直す」/「チェックイン / アウト」
  - 確認後に `/checkin/scan` 呼び出し
- QR/バーコード読み取りライブラリ: `@zxing/browser`（`BrowserMultiFormatReader.decodeFromVideoDevice`）

**設計意図**: QR スキャナは試験運用フェーズ（Phase 1.5 で本格運用）。手入力フォームを
正規ルートとして残し、QR は opt-in で並走させる。スキャナの起動／停止は React の
`useEffect` で `mode === 'qr' && state.kind === 'idle'` のときだけ走らせ、確認画面に
遷移した時点で controls.stop() を呼んで二重検出を防ぐ。

#### 7.1.2 初めての方一覧画面

- ヘッダー: 「初めての方はこちら」+ 戻るボタン
- 一覧: 未アクティベートの事前登録者をカード表示（ニックネーム＋学年）
- 登録日新しい順
- カードタップ → 確認ダイアログ → API呼び出し → 完了画面へ
- データロード中はスケルトン表示

#### 7.1.3 チェックイン完了画面

- 「○○さん、こんにちは！」（大きく）
- 学年・現在時刻
- 3秒後に自動でカメラビューに戻る

#### 7.1.4 チェックアウト完了画面

- 「○○さん、お疲れさま！」（大きく）
- 「今日の滞在時間: ○時間○分」
- 3秒後に自動でカメラビューに戻る

#### 7.1.5 アクティベート完了画面

- 「○○さん、ようこそ！」
- 「あなたのIDは 26001 です」（強調・大きく表示）
- 「スタッフにIDを伝えてネームカードを受け取ってね」
- 5秒後に自動でカメラビューに戻る（少し長めに）

#### 7.1.6 エラー画面

- 簡潔なエラーメッセージ（例: 「もう一度QRをかざしてください」）
- 3秒後に自動でカメラビューに戻る

#### 7.1.7 PWA設定

- `manifest.json` でホーム画面追加可能に（`display: fullscreen`）
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
5. `wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY` で登録（JSON文字列のまま）

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
- 同時アクティベートでID採番衝突が起きた場合はエラーになる（リトライで解決）
- 活動ログ記入は引き続き従来通りスプシ手作業（Phase 1.5まで）
- スプシ書き戻し失敗時はDBもロールバックするため、ユーザーに再試行を求める

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
- PEM鍵の改行が `\n` のままだとパース失敗するので、JSON.parseすれば自動展開される

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
