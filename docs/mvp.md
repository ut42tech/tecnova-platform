# tecnova-platform 実装仕様リファレンス（MVP / Phase 1）

| 項目                   | 内容                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| ドキュメントバージョン | v1.5                                                                       |
| ステータス             | Phase 1（MVP）として実装済み・本番稼働中                                    |
| 設計判断の根拠         | [`requirements.md`](./requirements.md)（全体構想・将来構想を含む完全版）   |
| システム構成図         | [`architecture.md`](./architecture.md)（コンポーネント構成・拡張ロードマップ） |
| 進捗・運用手順         | [`handoff.md`](./handoff.md)（残作業・既知の罠・セッション引き継ぎ）        |

---

## 1. このドキュメントの目的

本ドキュメントは、Phase 1（MVP）として**実装済みで本番稼働している仕様の現状リファレンス**である。
データモデル・API契約・画面構成・セットアップ手順を、実コードに準拠した形で一箇所にまとめる。

役割分担は以下の通り：

- **このドキュメント（mvp.md）** — 「いま何がどう実装されているか」という具体仕様（spec 本体）
- [`requirements.md`](./requirements.md) — なぜこの設計なのか（設計判断の根拠・将来構想）
- [`architecture.md`](./architecture.md) — システム全体の構成図・拡張ロードマップ
- [`handoff.md`](./handoff.md) — 進捗・残作業・運用手順・既知の罠

仕様を変更するときは、まず本書を更新してからコードに反映する（ドキュメント先行）。

---

## 2. Phase 1（MVP）のゴール

Phase 1 では**「子どもがiPad受付端末でチェックイン・チェックアウトでき、初回来場者は事前登録情報からアクティベートできる」**状態を実装し、本番稼働している。
活動ログ等のメンター業務は引き続き従来通りスプシ運用で並行し、Phase 1.5 以降で順次実装していく。

---

## 3. スコープ

Phase 1（MVP）の実装範囲と、意図的に含めていない範囲を示す。

### 3.1 実装済み（Phase 1）

✅ バックエンドAPI基盤（Hono on Cloudflare Workers）
✅ DB環境（Cloudflare D1 + Drizzle ORM）
✅ 4テーブルのスキーマとマイグレーション（participants / events / sessions / mentors）
✅ Google Sheets API連携（学生側スプシの読み書き）
✅ チェックインiPadアプリ（PWA・QRスキャン）
✅ 「初めての方」フロー（一覧表示・選択・ID採番・スプシ書き戻し）
✅ 通常チェックイン/チェックアウト
✅ 管理画面（当日の来場状況・参加者一覧・事前登録管理・メンター管理・ログイン）
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

> Cloudflare D1（SQLite）上の 4 テーブル（participants / events / sessions / mentors）と、内製ID採番・events 自動生成のロジックを示す。Better Auth コアテーブルは別管理。

### 4.1 Drizzleスキーマ

アプリ用スキーマは `packages/db/src/schema.ts` に実装されている。D1 は SQLite ベースなので `drizzle-orm/sqlite-core` を使う。

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// 参加者
export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(), // 例: '26001'
  preRegistrationId: text("pre_registration_id").unique().notNull(),
  // 氏名（本名）。識別補助でメイン識別子はニックネーム。
  // 既存行のために default '' を残し、新規は API 層が min(1) で弾く。
  fullName: text("full_name").default("").notNull(),
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

**マイグレーション履歴**（`packages/db/drizzle/` に生成される SQL）:

- `0000_wet_agent_brand` — 初期 4 テーブル
- `0001` — 追加調整
- `0002_early_network` — participants に `full_name` 列を追加
- `0003_graduated_grade_to_other` — grade の `'卒業'` を `'その他'` へ移行（`'卒業'` は廃止）

### 4.2 ID採番ロジック

```typescript
// 例: 2026年度なら "26" + 連番（001から）
// D1 はインタラクティブ・トランザクションがないため、SELECT で直近IDを取得 →
// 計算 → INSERT の流れで実装する。PK 衝突時の自動リトライは現行未実装（下記注記参照）。

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
- **採番衝突時の自動リトライは実装しない方針で確定**（同時タップはほぼ発生しないため）。`UNIQUE constraint failed: participants.id` が出た場合は手動再試行で回復する運用とする。衝突が実運用で問題化した場合のみ最大3回の自動リトライを検討（`apps/api/src/lib/checkin.ts` の TODO）
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

### 4.4 ターム区分と参加回数（`venue-schedule`）

会場の時間帯（ターム）と「参加回数」のカウントは **`packages/shared/src/venue-schedule.ts`** に集約した純粋ロジックで判定する（API・フロント共通）。DB スキーマは変更せず、`sessions.checked_in_at` から都度導出する（_derive_ 方式）。

| ターム (`TermId`) | ラベル | 時間帯（JST, `[start, end)`） |
| ----------------- | ------ | ----------------------------- |
| `morning`         | 朝     | 09:00–12:00                   |
| `afternoon`       | 昼     | 13:00–16:00                   |
| `evening`         | 夕方   | 16:00–19:00                   |

主な関数（来場判定はこのモジュールが唯一の出どころ。API もフロントもここを使い、各所で再計算しない）:

- `classifyVisit(instant: Date): { term: TermId | null; counted: boolean }` — **term と counted を一度の走査で確定する主 API**。term/counted の両方が要る箇所（プロフィール集計・当日一覧・会場集計）はこれを使う。
- `classifyTerm(instant: Date): TermId | null` — 来場時刻が属するターム。どの区間にも入らなければ `null`（昼休み 12–13 時・営業時間外）。
- `countsTowardParticipation(instant: Date): boolean` — `classifyVisit(instant).counted` の薄いラッパ。ターム内かつ終了まで `MIN_COUNTING_MINUTES`(=30) 以上残っていれば `true`。**「残り30分未満」は `false`**（チェックイン/アウト自体は通常どおり行う）。
- `participationKey(eventDate, term): string` — 参加回数の重複排除キー（`${eventDate}#${term}`）。会場集計では `#participantId` を足す。
- `toJstDateString(instant: Date): string` — JST 暦日 'YYYY-MM-DD'（`events.date` と同形）。API・フロントの「今日（JST）」判定を一本化。
- `TERM_LABELS: Record<TermId, string>` — 表示用ラベル（朝/昼/夕方）。

**参加回数（`participationCount`）の数え方**: `counted` なセッションを `participationKey(開催日, ターム)` 単位で重複排除した件数。朝＋昼に来れば 2、同一タームの事故的な再チェックインは 1 に集約。日本は DST が無く `Asia/Tokyo` は固定 UTC+9 のため、JST 壁時計 ↔ UTC 変換は単純な時差減算で正しく求まる。設計背景は `requirements.md` §5.4。

---

## 5. 学生側スプシ仕様

> 事前登録は教員側が学生側スプシ（`participants` シート）で管理する。バックエンドはこのシートを Source of Truth として読み書きする。Workers では `googleapis` が使えないため、Web Crypto による自前JWT + fetch 直叩きで実装している（実体は `packages/shared/src/google-sheets.ts`）。

### 5.1 シート構成

シート名: `participants`

| 列  | カラム名           | 型       | 説明                               | 編集権限     |
| --- | ------------------ | -------- | ---------------------------------- | ------------ |
| A   | 事前登録ID         | text     | PRE-2026-0001 形式                 | 教員側       |
| B   | 氏名               | text     | 本名（識別補助）                   | 教員側       |
| C   | ニックネーム       | text     | メイン識別子                       | 教員側       |
| D   | 学年               | text     | 小1, 小4, 中2, その他 等           | 教員側       |
| E   | 事前登録日         | date     | YYYY-MM-DD                         | 教員側       |
| F   | 内製ID             | text     | 26001 等（バックエンドが書き込み） | バックエンド |
| G   | アクティベート日時 | datetime | YYYY-MM-DD HH:mm:ss（同上）        | バックエンド |
| H   | アクティベート済   | boolean  | TRUE/FALSE（同上）                 | バックエンド |

1行目はヘッダー、2行目以降がデータ。

### 5.2 バックエンドからのアクセス方法

**読み取り**:

- `GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/participants!A2:H` で全データ取得
- レスポンスを配列にパースし、Hが `FALSE` または空のレコードを「未アクティベート」としてフィルタ
- 行データの読み取りキャッシュは持たず毎回フェッチする（アクセストークンのみ 1 時間キャッシュ）

**書き込み**:

- アクティベート時、対象行のF/G/H列を更新
- 行番号は読み取り時のインデックスから特定（Aの順序に依存するためソート不可）
- `PUT https://sheets.googleapis.com/v4/spreadsheets/{id}/values/participants!F{row}:H{row}?valueInputOption=USER_ENTERED` で3列まとめて更新
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

### 5.4 Workers環境でのGoogle Sheets API実装

`googleapis` パッケージはNode.js依存のためWorkersで動かない。**Web Crypto APIで自前JWT生成 + fetch直叩き**で対応している。実装は `packages/shared/src/google-sheets.ts` を参照。

公開している関数:

| 関数                                                       | 用途                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `getCachedAccessToken(encodedKey)`                         | サービスアカウントJWTでアクセストークンを取得（1時間キャッシュ） |
| `fetchSheetRows(encodedKey, spreadsheetId, range)`         | 指定レンジを2次元配列で読む                                      |
| `updateSheetRow(encodedKey, spreadsheetId, range, values)` | `valueInputOption=USER_ENTERED` で1行を書き込み                  |
| `appendSheetRows(encodedKey, spreadsheetId, range, rows)`  | 末尾に行を追加（事前登録の新規行追加）                           |
| `clearSheetRange(encodedKey, spreadsheetId, range)`        | レンジをクリア（事前登録行の削除）                               |

**重要な設計判断**:

- 第1引数は **base64 エンコード済みのサービスアカウントJSON文字列**を受け取る。コード内で `atob` → `JSON.parse` の順にデコードする。`.dev.vars` の dotenv パーサが `\n` を実改行に変換して `JSON.parse` が壊れる問題を回避するため
- アクセストークンはモジュールスコープでキャッシュ（`expiresAt > now + 60s` の条件で再利用）。Workers インスタンスがリサイクルされたら自然に再生成される
- 鍵の PEM ヘッダー除去 → `crypto.subtle.importKey('pkcs8', ...)` → RS256 署名 → JWT 組み立て、の順
- エラー時は HTTP ステータス + 本文を含む例外を投げる（呼び出し側で saga の補償処理を判断するため）

**なぜ base64 なのか**: 生 JSON を `.dev.vars` に書くと、dotenv パーサが `private_key` 内の `\n` エスケープを実改行に変換してしまい、Worker 側で `JSON.parse` が「Bad control character」で失敗する。base64 でラップしておけば dotenv は手を加えず、コード側で `atob` → `JSON.parse` の順に処理できる。

疎通確認は `apps/api` の `/sheets/health` エンドポイント（参加者シートの行数を返す）で行える。

### 5.5 参加者 Drive フォルダの自動作成（GAS webhook）

アクティベート成功時、参加者ごとの作品保存用 Google Drive フォルダを GAS（Apps
Script）の Web App エンドポイント経由で作成する。

- Workers 側は `c.executionCtx.waitUntil()` でレスポンス送信後に POST する
  （実装: `apps/api/src/lib/drive-folder.ts` / `apps/api/src/routes/checkin.ts` の
  `queueDriveFolderCreation`）。Drive 作成の失敗はチェックインを止めない。
- GAS 側は `secret` 一致を確認してから Drive フォルダを `participantId_nickname` で作成し、
  `{ ok: true, folderId, folderName, reused }` を返す。
- 必要な Secret は 2 つ:

  | 変数名                     | 説明                                                                   |
  | -------------------------- | ---------------------------------------------------------------------- |
  | `GAS_DRIVE_WEBHOOK_URL`    | GAS Web App の `/exec` URL                                             |
  | `GAS_DRIVE_WEBHOOK_SECRET` | GAS 側と共有する任意のシークレット文字列（リクエストボディに同梱する） |

  両方が未設定の場合は機能ごと無効化される（`url && secret` が揃わないと no-op）。
  片方だけ設定されている場合は `console.warn` を出してスキップする（fail-closed）。

---

## 6. APIエンドポイント仕様

> Hono on Workers の実装エンドポイント一覧。`apps/api/src/routes/` 配下にモジュール単位（health / auth / checkin / admin / pre-registrations）で実装され、契約は `packages/shared/src/schemas/`（checkin.ts / admin.ts）の Zod スキーマで定義される。

すべてのレスポンスは JSON。エラー時は `apiErrorHandler`（`apps/api/src/lib/errors.ts`）が HTTP 4xx/5xx + `{ "error": "ERROR_CODE", "message": "..." }` の封筒を返す。

**認証なしで叩けるのは `/health` 系のみ**：

- `GET /health` — 参加者数と status を返す疎通確認
- `GET /sheets/health` — 参加者シートの行数を返すスプシ疎通確認

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
      "fullName": "山田拓也",
      "nickname": "たくや",
      "grade": "小4",
      "registeredAt": "2026-04-15"
    }
  ]
}
```

注: 登録日（`registeredAt`）新しい順にソート。

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
  "fullName": "山田拓也",
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

1. 事前登録IDから当該行をスプシで検索（`fetchSheetRows`）。なければ `NOT_FOUND`
2. 内製ID採番（`generateNextParticipantId`）
3. event_id を取得 or 作成（`getOrCreateTodayEvent`）
4. **`db.batch([...])` で原子的に書き込み**:
   - `INSERT participants`（id, preRegistrationId, fullName, nickname, grade）
   - `INSERT sessions`（participantId, eventId, checkedInAt）
5. スプシ書き戻し（F/G/H列を更新）
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
  "fullName": "山田拓也",
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
  "fullName": "山田拓也",
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

**レスポンス**: `scanResponseSchema`（`action` で判別する discriminated union）。`fullName` / `nickname` を含む。

- `action: "check_in"` → `{ action, sessionId, fullName, nickname, checkedInAt }`
- `action: "check_out"` → `{ action, fullName, nickname, checkedInAt, checkedOutAt, stayDurationMinutes }`

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
      "fullName": "山田拓也",
      "nickname": "たくや",
      "checkedInAt": "2026-05-15T09:32:15+09:00",
      "checkedOutAt": "2026-05-15T12:30:00+09:00",
      "stayDurationMinutes": 178
    }
  ]
}
```

#### `GET /checkin/participants/search`

**ニックネームと氏名（fullName）の両方**を LIKE 部分一致で検索し、active な参加者を
返す。マニュアル入力画面の「名前で探す」モードで使う。`/api/participants` と違って
admin 権限不要・ページネーションなし・active=true のみ・最大 50 件。

**クエリ**: `?q=<1〜40文字>`

**レスポンス**:

```json
{
  "participants": [
    { "id": "26001", "fullName": "山田拓也", "nickname": "たくや", "grade": "小4" }
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
    "id": "26001",
    "fullName": "山田拓也",
    "nickname": "たくや",
    "grade": "小4",
    "activatedAt": "2026-04-20T09:10:00+09:00"
  },
  "stats": {
    "visitCount": 5,
    "participationCount": 4,
    "visitDayCount": 3,
    "uncountedVisitCount": 1,
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
      "term": "afternoon",
      "counted": true,
      "isPresent": false
    }
  ]
}
```

- `participationCount` は §4.4 のルールで数えた参加回数（スキルカードのチェック数に対応・有効）。`visitCount` は総来場回数（生のセッション数）、`visitDayCount` は重複排除した来場日数、`uncountedVisitCount` は 30分ルール・営業時間外などで参加回数に数えない来場数。`participationCount` は同一タームの再来場を集約するため、`visitCount = participationCount + uncountedVisitCount` とは限らない（同一タームに2回来た分は参加回数では1に集約される）。
- 各セッションの `term`（`morning`/`afternoon`/`evening`、営業時間外は `null`）と `counted`（30分ルールを満たし参加回数に数えられるか）は `checked_in_at` から導出した値。これらは API（`classifyVisit`）が確定し、フロントは再計算しない。

#### `POST /checkin/participants/:participantId/attendance`

プロフィール画面の「チェックイン」「チェックアウト」ボタンから呼ばれる実行
エンドポイント。サーバーが現在の在場状態を再判定して、`check_in` / `check_out`
のどちらかを実行する。`scanValue` を URL パラメータから読む `/checkin/scan` の
別表現と考えればよい。

**レスポンス**: `/checkin/scan` と同じ `scanResponseSchema`。

### 6.2 管理画面用（`/api/*`・メンター認証必須）

`/api/*` も `/checkin/*` と同じ Cookie ベースの mentor 認証で守る。一部は admin role 専用。

#### `GET /api/me`

ログイン中のユーザーとメンター情報を返す。

**レスポンス**:

```json
{
  "user": { "id": "...", "email": "mentor@example.com", "name": "山田太郎" },
  "mentor": {
    "id": "...",
    "email": "mentor@example.com",
    "name": "山田太郎",
    "role": "admin"
  }
}
```

#### `GET /api/sessions/today`

当日の来場状況一覧。当日の event がまだ無い場合は `event` が `null`。

**レスポンス**:

```json
{
  "event": { "id": "uuid-...", "date": "2026-05-15" },
  "sessions": [
    {
      "sessionId": "uuid-...",
      "participantId": "26001",
      "fullName": "山田拓也",
      "nickname": "たくや",
      "grade": "小4",
      "checkedInAt": "2026-05-15T09:32:15+09:00",
      "checkedOutAt": null,
      "isPresent": true,
      "term": "morning",
      "counted": true
    }
  ],
  "summary": {
    "totalCheckedIn": 12,
    "currentlyPresent": 8,
    "checkedOut": 4
  }
}
```

- 各セッションの `term`（`morning`/`afternoon`/`evening`、営業時間外は `null`）と `counted`（30分ルールを満たし参加回数に数えられるか）は §4.4 の `venue-schedule` で `checked_in_at` から **サーバ側で確定**した値。重要な区分判定ロジックをフロントに置かないため、ダッシュボード／受付りれきはこの値をそのまま表示する（クライアントで `classifyTerm` を再計算しない）。

#### `GET /api/sessions?date=YYYY-MM-DD`

指定日のセッション一覧。`date` を省略すると当日（JST）として解決する。レスポンスは
`GET /api/sessions/today` と同一形（`todaySessionsResponseSchema`）。

#### `GET /api/events`

ダッシュボードの日付ピッカー用に、過去にチェックインがあった開催日を開催日降順で
直近 50 件返す。

**レスポンス**:

```json
{ "events": [{ "id": "uuid-...", "date": "2026-05-15" }] }
```

#### `GET /api/participants`

参加者一覧（ページネーション対応）。

**クエリパラメータ**:

- `page` — ページ番号（既定 1）
- `limit` — 1ページ件数（既定 50・最大 200）
- `search` — 任意。**ID・氏名・ニックネームの部分一致**
- `grade` — 任意。学年で絞り込み
- `active` — 任意。`'true'` / `'false'` で有効/無効を絞り込み

**レスポンス**:

```json
{
  "participants": [
    {
      "id": "26001",
      "fullName": "山田拓也",
      "nickname": "たくや",
      "grade": "小4",
      "activatedAt": "2026-05-15T09:32:15+09:00",
      "active": true
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 42 }
}
```

#### `GET /api/stats/participation`

会場全体の参加回数集計。ターム別・日別の参加回数を返す。任意の期間で絞り込める。`counted` 判定（§4.4）は SQL では表現できないため、対象セッションを取得して JS で集計する（`(開催日, ターム, 参加者)` 単位で重複排除）。

**クエリパラメータ**:

- `from` — 任意。集計開始日（`YYYY-MM-DD`, JST, 含む）
- `to` — 任意。集計終了日（`YYYY-MM-DD`, JST, 含む）

**レスポンス**:

```json
{
  "range": { "from": "2026-05-01", "to": "2026-05-31" },
  "totals": { "morning": 120, "afternoon": 98, "evening": 45, "total": 263, "days": 12 },
  "byDate": [
    { "date": "2026-05-17", "morning": 18, "afternoon": 15, "evening": 0, "total": 33 },
    { "date": "2026-05-16", "morning": 0, "afternoon": 0, "evening": 12, "total": 12 }
  ]
}
```

#### `GET /api/mentors` / `POST /api/mentors` / `PATCH /api/mentors/:id`（admin）

メンター（運営者）の一覧・追加・編集（いずれも admin 権限必須）。

- `GET` → `{ mentors: [{ id, email, name, role, active, createdAt, lastLoginAt }] }`
- `POST` → body `{ email, name, role }`（`role` 既定 `mentor`）。既存メールは `EMAIL_ALREADY_EXISTS`
- `PATCH /:id` → body `{ name?, role?, active? }`（1つ以上必須）。存在しない場合は `NOT_FOUND`。email は OAuth 突合キーのため変更不可

**POSTリクエスト**:

```json
{ "email": "mentor@example.com", "name": "山田太郎", "role": "mentor" }
```

#### `GET /api/pre-registrations` / `POST /api/pre-registrations` / `DELETE /api/pre-registrations/:preRegistrationId`（admin）

学生側スプシ上の事前登録者を管理する admin 専用 API。

- `GET`: **未アクティベート一覧とアクティベート済み一覧の両方**を返す（下記）
- `POST`: `preRegistrationId`（`PRE-YYYY-NNNN`）を自動採番して行を追加する
- `DELETE /:preRegistrationId`: 未アクティベート行のみ削除。アクティベート済みは 409（`ALREADY_ACTIVATED`）

**GETレスポンス**:

```json
{
  "preRegistrations": [
    {
      "preRegistrationId": "PRE-2026-0042",
      "fullName": "山田拓也",
      "nickname": "たくや",
      "grade": "小4",
      "registeredAt": "2026-04-15"
    }
  ],
  "activatedPreRegistrations": [
    {
      "preRegistrationId": "PRE-2026-0001",
      "fullName": "鈴木花子",
      "nickname": "はな",
      "grade": "小5",
      "registeredAt": "2026-04-01",
      "internalId": "26001",
      "activatedAt": "2026-04-20T09:10:00+09:00"
    }
  ]
}
```

**POSTリクエスト**（`preRegistrationId` はバックエンドが採番するため含めない）:

```json
{
  "fullName": "山田拓也",
  "nickname": "たくや",
  "grade": "小4",
  "registeredAt": "2026-05-05"
}
```

`fullName` は 1〜80 文字、`nickname` は 1〜40 文字、`grade` は GRADES の enum で検証する。

### 6.3 認証エンドポイント（Better Auth提供）

- `GET /api/auth/session` セッション情報取得
- `POST /api/auth/sign-in/social` Google OAuth開始
- `GET /api/auth/callback/google` OAuth コールバック
- `POST /api/auth/sign-out` ログアウト

許可リスト判定: Better Authの `signIn` フックで mentors テーブルのemailを照合し、存在しないか `active=false` ならエラー。

---

## 7. 画面仕様

> 受付端末（apps/checkin・Next.js 16 / React 19 iPad PWA）と管理画面（apps/admin・Next.js 16 / React 19）の画面構成。API 呼び出しは `@tecnova/ui` の `apiFetch` を通し、レスポンスは `packages/shared/src/schemas` でアサートする。

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
- 「参加状況」タイルに **参加回数**（`participationCount`・スキルカードのチェック数に対応・主役表示）を大きく出し、内訳として **総来場回数**（`visitCount`）/ **来場日数**（`visitDayCount`）/ **無効な来場回数**（`uncountedVisitCount`）を併記。加えて 登録日 / 最後に来た日 / 累計滞在時間。
- **来場回数**の活動カレンダータイル表示（1 来場 = 1 タイル）。**カウントされた来場は滞在時間の濃淡で色付け（3 時間で最濃＝`attendanceIntensityClasses`）、カウント対象外の来場は色を付けず × アイコンで埋める**。凡例に濃淡グラデーションと「× 対象外」を併記。
- セッション履歴の各行に色分けタームバッジ（朝=水色/昼=黄色/夕方=紫の `TermBadge`）と、30分ルールで参加回数に数えない来場の「カウント対象外」表示

#### 7.1.3 初めての方一覧画面 `/first-time`

- 未アクティベートの事前登録者をカード表示（ニックネーム＋学年）
- 登録日新しい順
- カードタップ → `POST /checkin/activate` 呼び出し → ID 表示画面 → トップ復帰
- ロード中はスケルトン表示

#### 7.1.4 受付履歴画面 `/history`

- `GET /checkin/history/today` で当日のセッション一覧を取得
- 各行に「現在在場 / 退室済」バッジ、色分けタームバッジ（朝/昼/夕方・API の `term` を表示）、30分ルールで対象外の来場には「カウント対象外」バッジ、チェックイン時刻、滞在時間を表示
- 在場中の参加者を選択して「一括チェックアウト」を確認ダイアログ越しに実行（`POST /checkin/history/check-out-bulk`）。タームの終わり（12:00・各回終了時）の締めに使う
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
- 日付ピッカー: 過去の開催日（`GET /api/events`）＋今日を切り替えて表示
- サマリカード: 「現在の来場者数」「今日の総チェックイン数」「チェックアウト済」
- セッション一覧テーブル
  - ID / **氏名** / ニックネーム / 学年 / ターム（色分けバッジ・API の `term` を表示。30分ルールで対象外なら「カウント対象外」併記）/ チェックイン時刻 / チェックアウト時刻 / 状態
  - 行クリックで `ParticipantDetailSheet`（参加者詳細）を開く（**参加回数** `participationCount` とセッションごとのターム表記を表示）

#### 7.2.3 参加者一覧

- 検索ボックス（**ID / 氏名 / ニックネーム**の部分一致）＋ 学年フィルタ ＋ 状態（有効/無効）フィルタ
- テーブル: ID / **氏名** / ニックネーム / 学年 / ID発行日 / 状態
- ページネーション
- 閲覧専用（編集は Phase 1.5）

#### 7.2.4 メンター管理（admin権限のみ）

- 一覧: メアド / 名前 / ロール / 状態
- 追加: メアド・名前・ロール入力フォーム
- 編集: ロール変更・active切替

#### 7.2.5 事前登録管理（admin権限のみ）

- 追加フォーム: **氏名（最大80文字）**・ニックネーム（最大40文字）・学年・事前登録日を入力（IDは `PRE-YYYY-NNNN` で自動採番）
- 未アクティベート一覧: 事前登録ID / 氏名 / ニックネーム / 学年 / 事前登録日 ＋ 削除（確認ダイアログ）
- 折りたたみ「ID発行済みの利用者」セクション: アクティベート済み一覧（`internalId` / `activatedAt` を表示）

#### 7.2.6 集計画面 `/stats`

- `GET /api/stats/participation`（任意で `?from=&to=`）で会場全体の参加回数集計を取得
- 期間フィルタ（from/to）＋ KPI カード（総参加回数／朝・昼・夕方の内訳／開催日数）＋ 日別×ターム別テーブル（開催日降順）
- ナビ（`app-shell`）に「集計」を追加

---

## 8. セットアップ手順

> 既存のモノレポ（pnpm + Turborepo + Biome）の構成と、運用に必要な外部サービス（Cloudflare D1 / Vercel / Google Cloud）の設定手順をまとめる。クローン後の依存解決は `pnpm install` で完結する。

### 8.1 必要なアカウント・サービス

- GitHubアカウント
- Cloudflareアカウント（Workers + D1用）
- Vercelアカウント（フロント2つ用：checkin / admin）
- Google Cloud Platformアカウント（Sheets API + OAuth用）

### 8.2 モノレポ構成と依存の入れ方

pnpm workspace（`pnpm-workspace.yaml` で `apps/*` と `packages/*` を束ねる）+ Turborepo + Biome の構成。
各 app / package の役割は以下の通り：

| ワークスペース      | name（package.json） | 役割 / 主な依存                                                          |
| ------------------- | -------------------- | ----------------------------------------------------------------------- |
| `apps/api`          | `@tecnova/api`       | Hono on Cloudflare Workers。`hono` / `drizzle-orm` / `better-auth` / `@cloudflare/workers-types`（dev）/ `wrangler`（dev） |
| `apps/checkin`      | `checkin`            | 受付端末 PWA。Next.js / React / `@zxing/browser`                        |
| `apps/admin`        | `admin`              | 管理画面。Next.js / React                                               |
| `packages/db`       | `@tecnova/db`        | Drizzle schema + migrations。`drizzle-orm` / `drizzle-kit`（dev）       |
| `packages/shared`   | `@tecnova/shared`    | 型・Zodスキーマ・Sheets連携。`zod`                                      |
| `packages/ui`       | `@tecnova/ui`        | 共通 UI（shadcn/ui）・`apiFetch` 等の API クライアント・JST フォーマッタ・`MeProvider` |

注意点：

- **`packages/auth` は存在しない。** Better Auth の設定は `apps/api/src/lib/auth.ts` の `createAuth(env)` ファクトリに集約している。Workers ではリクエスト毎に instance を生成する必要があり、Env を直接受け取れる API 側に置くのが自然なため
- フロント 2 つ（checkin / admin）は `@tecnova/` プレフィックスを付けず `checkin` / `admin` という name にしている（`pnpm --filter <name>` で指定する）
- 新規にパッケージ・アプリを足すときは `create-hono` / `create-next-app` などの CLI を使い、`package.json` や `tsconfig.json` を手書きしない
- 依存追加は `pnpm --filter <name> add <pkg>` で対象ワークスペースに入れる

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

## 9. 運用上の既知の制約

> 本番運用で踏みやすい仕様上の制約。進捗・残タスクは [`handoff.md`](./handoff.md) で管理する。

- 当日朝に追加された事前登録者は反映されない可能性がある（読み取りキャッシュ＋スプシ手作業転記の遅延）
- Wi-Fi切断時はチェックイン業務が一時停止する
- 同時アクティベートでID採番衝突が起きた場合はエラーになる（現行は手動再試行で回復）
- 活動ログ記入は引き続き従来通りスプシ手作業（Phase 1.5まで）
- スプシ書き戻し失敗時はDBもロールバック（saga 補償）するため、ユーザーに再試行を求める
- **ターム境界の締めは手動**: 12:00（午前タームの終わり）と各回終了時に、受付端末「受付りれき」画面の「滞在中全員をチェックアウト」を押して締める運用。Cron 自動化は Phase 1.5 以降（§3.2）
- **押し忘れ時の午後再スキャン誤動作**: 午前の全員チェックアウトをし忘れたまま、午後も来た子が再スキャンすると、`processScanValue` が開いたままの午前セッションを検知して**チェックアウト**してしまう（午後の参加が記録されない）。もう一度スキャンすればチェックインに復帰する。当面は運用ルール（12:00 で必ず締める）で回避する

---

## 10. トラブルシュート

### 10.1 Better Auth on Workers でハマったら

**症状**: 33秒ハング、503エラー、`Network connection lost`

**対応**:

- `ctx.waitUntil(...)` を必ず使う（レスポンス送信後のバックグラウンドタスクを完了させるため）
- リクエスト毎にBetter Auth instanceを生成する（middleware内で）
- 詳細は Honoの公式ドキュメント `https://hono.dev/examples/better-auth-on-cloudflare` を参照

### 10.2 Google Sheets APIが動かない

**症状**: `googleapis` パッケージのインポートエラー、Workers環境で動かない

**対応**:

- `googleapis` は使わず、`fetch` + Web Crypto APIで自前JWT生成（本書5.4節参照）
- アクセストークンは1時間有効、モジュールスコープでキャッシュして使い回す
- サービスアカウント鍵を平文 JSON のまま `.dev.vars` に置かない。base64 エンコードして保持し、Worker 側で `atob` → `JSON.parse` でデコードする

### 10.3 D1 関連の落とし穴

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

- 同時アクティベートで採番が衝突した。手動再試行で回復する運用で確定（同時タップはほぼ発生しないため自動リトライは入れない）。衝突が実運用で頻発した場合のみ `generateNextParticipantId` からの最大3回リトライを `apps/api/src/lib/checkin.ts` で検討

### 10.4 iPadのカメラが動かない

**症状**: カメラAPIが拒否される

**対応**:

- HTTPSであることを確認（Vercelデプロイなら自動）
- iOS Safariの設定でカメラ許可を確認
- `getUserMedia` のpermission stateを明示的にチェック

### 10.5 Drizzleマイグレーションが D1 に反映されない

**症状**: `wrangler d1 migrations apply` 実行後にスキーマが変わらない

**対応**:

- `wrangler d1 migrations list tecnova-db --local`（または `--remote`）で適用済みマイグレーションを確認
- `packages/db/drizzle/` に SQL が生成されているか確認（生成は `pnpm --filter @tecnova/db db:generate`）
- `wrangler.toml` の `migrations_dir` パスが `apps/api` から見て正しいか確認（`../../packages/db/drizzle`）
- ローカルと本番の D1 は完全に独立。ローカルで動作確認後、本番には別途 `--remote` で適用する

---

## 11. このドキュメントの使い方

- 本書は Phase 1（MVP）の現状の実装仕様リファレンス（spec 本体）として参照する
- 仕様変更が発生した場合、本書を更新してからコードを修正する（ドキュメント先行）
- Phase 1.5 へ移行する際は、スコープ外項目を実装ガイドとして本書に追記、または別ドキュメントに展開する
- 設計判断の根拠は [`requirements.md`](./requirements.md)、システム全体構成・拡張ロードマップは [`architecture.md`](./architecture.md)、進捗・運用手順は [`handoff.md`](./handoff.md) を参照
