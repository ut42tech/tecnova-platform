# チェックイン記録の修正機能（追加・編集・削除）設計

作成日: 2026-10-11 / 関連 Issue: #48（削除）・#49（編集）
ブランチ: `feat/admin-session-correction`（`fix/checkin-qr-on-demand-scan` から分岐 → PR は develop。#50 → #51 の順にマージした後でマージする）

## 0. 背景とゴール

受付の現場で、操作ミスによる来場記録（`sessions`）の誤りが頻発している。システム上で訂正する手段が無いため、参加回数の集計（研究データにもなる）が誤ったまま残る。

現場で実際に起きている誤り（すべて対象）:

| 誤り | 必要な操作 |
| --- | --- |
| チェックイン忘れ（来ていたのに記録が無い） | 記録の**追加** |
| チェックアウト忘れ（滞在中のまま／一括チェックアウトの時刻になっている） | 退場時刻の**編集** |
| 別の子で受付した | 記録の子の**付け替え**（または削除して追加） |
| 二重・誤操作の記録（押し間違いでチェックアウト→再チェックイン等） | 記録の**削除** |

**ゴール:** admin ロールのメンターが、管理画面から来場記録を追加・編集・削除できるようにする。誤った記録が集計を壊さないよう、守るべきルールをアプリ側で検証する。

## 1. 確定した要件（ユーザー決定事項）

- 操作できるのは **admin ロールのみ**（Issue #48 / #49）。admin 以外のメンターには UI を一切出さない
- 入口は 2 か所: **A. ダッシュボード**（日付ごとの来場一覧）と **B. 利用者詳細**（子どもごとの来場履歴）。フォームと API は共通
- **修正の履歴は残さない**（最新の状態だけを持つ。DB のテーブル構造は変えない＝マイグレーション不要）
- **無効化した子の記録も**追加・修正してよい（過去の記録を直す場面のため。受付端末側は従来どおり無効化した子を受け付けない）
- 「別の子で受付した」場合は、記録の子を**付け替え**られる
- API の書き込みロジックは、`@cloudflare/vitest-pool-workers` による**自動テスト**で確かめる

## 2. 来場記録のルール（不変条件）

DB には制約が無い（一意制約・CHECK・カスケードなし）ため、すべてアプリ側で守る。

1. **開催日は入場時刻から決める**: 記録の `event_id` は、常に `checkedInAt` の JST 日付の開催日（`events.date`）を指す。その日の開催日が無ければ作る。編集で入場日が変わったら、その日の開催日へ移す。参加回数の集計は「日付＝開催日」「ターム＝入場時刻の JST 壁時計」で行うため、両者がずれると集計が崩れる（現行の作成経路と同じ不変条件）
2. **退場は入場より後、かつ同じ JST 日のうち**: `checkedOutAt > checkedInAt`（同時刻は不可）。日をまたぐ記録は作らない
3. **未来の時刻は不可**: `checkedInAt` / `checkedOutAt` は現在時刻 + 1 分以内（端末の時計ずれを許容する猶予）
4. **「滞在中」（`checkedOutAt = null`）は今日の記録だけ**: 過去日の記録は退場時刻が必須。過去日に滞在中の記録が残ると、その日の一覧で「来場中」と表示され続けるため
5. **同じ子・同じ日の他の記録と時間が重ならない**: 区間は半開区間 `[入場, 退場)`。滞在中の記録は「現在時刻まで」続いているとみなす。境界で接する（11:40 退場・11:40 入場）のは重ならない扱い。この規則により、同じ子の「滞在中の記録が 2 件」も防げる
6. **子は存在する ID であること**（有効・無効は問わない）。付け替え先の子にもルール 5 を当てはめる
7. **記録が 1 件も無くなった過去の開催日は削除する**: 日付の選択肢（`/api/events`）やサイネージの「前回の開催」（`/api/signage/previous-summary`）に空の日が残らないようにする。**今日の開催日は消さない**（受付中のチェックインと競合させないため）

**既にルールに反しているデータの扱い**: ルールは「追加・編集で保存する内容」に対して検証する。削除は常にできる。

- チェックアウト忘れで過去日に滞在中のまま残っている記録は、退場時刻を入れて保存すれば直る（退場時刻を入れずに他の項目だけ変えるとルール 4 で保存できない）
- 時間が重なっている二重記録は、不要な方を削除してから残りを直す（片方を編集しようとすると、もう片方との重なりでルール 5 に当たる）

## 3. API

すべて `/api/*`（`requireAuthenticatedMentor` 適用済み）配下。既存の `GET /api/sessions` / `GET /api/sessions/today` は今までどおり全メンターが使える。追加する 3 つは**ルート単位で `requireAdmin`** を付ける（`/sessions` にサブルーターを mount すると既存の GET と衝突するため）。

| メソッド | パス | 本文 | 成功時 |
| --- | --- | --- | --- |
| POST | `/api/sessions` | `{ participantId, checkedInAt, checkedOutAt }` | 201 `{ eventDate, session }` |
| PATCH | `/api/sessions/:sessionId` | `{ participantId?, checkedInAt?, checkedOutAt? }`（1 つ以上） | 200 `{ eventDate, session }` |
| DELETE | `/api/sessions/:sessionId` | なし | 204 |

- `participantId` は 5 桁の内製 ID。`checkedInAt` / `checkedOutAt` は ISO 8601（UTC）文字列。`checkedOutAt: null` は「滞在中」（PATCH では滞在中に戻す意味になる）
- `session` は既存の `todaySessionItemSchema`（`term` / `counted` / `isPresent` を含む）と同じ形。`eventDate` は記録が属する開催日（`'YYYY-MM-DD'`）で、画面がその日付へ表示を切り替えるために使う
- 本文の形式エラーは既存の `invalidBodyError`（400）

### 3.1 エラー（`SessionError`）

既存のドメインエラーと同じく `{ error: code, message }` で返し、`apiErrorHandler` にステータス表を追加する。

| code | HTTP | 意味 |
| --- | --- | --- |
| `SESSION_NOT_FOUND` | 404 | 記録が無い |
| `PARTICIPANT_NOT_FOUND` | 404 | 子の ID が無い |
| `CHECKOUT_BEFORE_CHECKIN` | 400 | ルール 2（退場が入場以前） |
| `SPANS_DAYS` | 400 | ルール 2（日をまたぐ） |
| `FUTURE_TIME` | 400 | ルール 3 |
| `OPEN_SESSION_NOT_TODAY` | 400 | ルール 4 |
| `OVERLAP` | 409 | ルール 5 |

### 3.2 書き込みの手順（D1 にトランザクションが無い前提）

新規ファイル `apps/api/src/lib/session-admin.ts` に、`createSessionByAdmin` / `updateSessionByAdmin` / `deleteSessionByAdmin` を置く。現在時刻 `now` は引数で受け取る（テストで固定するため）。

- **追加**: 子の存在確認 → 入場日を算出 → 同じ子・同じ日（`events.date` で JOIN）の既存記録を取得 → ルール 2〜5 を検証 → `db.batch` で「開催日の作成（`INSERT … ON CONFLICT(date) DO NOTHING`）」と「記録の挿入（`event_id` は日付からのサブクエリで解決）」を一括実行。検証を開催日の作成より前に行うので、検証エラーで空の開催日が残らない
- **編集**: 記録（とその開催日）を取得 → 変更をマージ → 新しい子・新しい入場日で既存記録（自分を除く）を取得 → ルール 2〜6 を検証 → `db.batch` で「開催日の作成」「記録の更新（子・開催日・時刻）」「元の開催日が空かつ過去なら削除」を一括実行
- **削除**: 記録を取得 → `db.batch` で「記録の削除」「その開催日が空かつ過去なら削除」を一括実行
- 「空かつ過去なら削除」は 1 文で表す: `DELETE FROM events WHERE id = ? AND date <> <今日> AND NOT EXISTS (SELECT 1 FROM sessions WHERE event_id = ?)`
- 開催日の get-or-create は `apps/api/src/lib/checkin.ts` の `getOrCreateTodayEvent` を日付引数版 `getOrCreateEventByDate` に一般化し、既存の受付経路はそれを今日の日付で呼ぶ（挙動は不変）。batch 内では同等の `INSERT … ON CONFLICT DO NOTHING` を使う

## 4. 共通ロジック（`packages/shared`）

API と管理画面の両方で使う純粋関数。vitest で先にテストを書く。

- `venue-schedule.ts` に追加
  - `jstDateTimeToInstant(date: 'YYYY-MM-DD', time: 'HH:mm'): Date` — JST の日付と時刻を UTC instant にする（Asia/Tokyo は固定 UTC+9）
  - `toJstTimeString(instant: Date): 'HH:mm'` — フォームの初期値用
- 新規 `session-rules.ts`
  - `type SessionRuleViolation = 'CHECKOUT_BEFORE_CHECKIN' | 'SPANS_DAYS' | 'FUTURE_TIME' | 'OPEN_SESSION_NOT_TODAY' | 'OVERLAP'`
  - `validateSessionTimes({ checkedInAt, checkedOutAt }, now): SessionRuleViolation | null` — ルール 2〜4。判定順は `FUTURE_TIME` → `CHECKOUT_BEFORE_CHECKIN` → `SPANS_DAYS` → `OPEN_SESSION_NOT_TODAY`
  - `findOverlappingSession(target, siblings, now)` — ルール 5。重なる記録を 1 件返す（無ければ null）
  - `SESSION_RULE_MESSAGES: Record<SessionRuleViolation, string>` — 画面に出す日本語（例: `CHECKOUT_BEFORE_CHECKIN` →「退場時刻は入場時刻より後にしてください」）
- `schemas/admin.ts` に追加: `createSessionRequestSchema` / `updateSessionRequestSchema`（PATCH は 1 項目以上を `.refine` で要求。既存の `updateMentorRequestSchema` と同じ書き方）/ `sessionMutationResponseSchema`、および型の export

## 5. 画面（`apps/admin`）

### 5.1 共通部品

- **ダイアログ部品**: `packages/ui` に shadcn の `dialog` を CLI（`shadcn add dialog`）で追加する。利用者詳細（Sheet）の上にも重ねて開けるよう、記録フォームは横パネルではなく中央のダイアログにする
- **`SessionFormDialog`**（追加・編集で共用。`apps/admin/src/components/session-form-dialog.tsx`）
  - **子ども**: `ParticipantPicker`（`participant-picker.tsx`）で ID・氏名・ニックネームを検索して選ぶ（`GET /api/participants?search=`）。選択後は「ニックネーム（氏名）・学年・ID」を表示し、「変更」で選び直せる（＝付け替え）
  - **日付・入場時刻・退場時刻**: `<input type="date">` / `<input type="time">`（JST）。送信時に `jstDateTimeToInstant` で ISO に変換する
  - **「まだ滞在中」**: 日付が今日のときだけ表示。オンなら退場時刻を無効化し `checkedOutAt: null` を送る
  - **検証**: 入力のたびに `validateSessionTimes` を実行し、項目の下にメッセージを出す（エラー中は保存ボタンを無効化）。ルール 5（重なり）と子の存在はサーバーで判定し、返ってきた `error` コードを `SESSION_RULE_MESSAGES` などで日本語にしてダイアログ内に表示する
  - **今日の記録を扱うとき**: 「受付端末での次の操作（チェックイン／チェックアウト）が変わります」と注意書きを出す
  - **初期値**: 追加時、日付は入口に応じて決める（5.2 / 5.3）。日付が今日なら入場時刻は現在時刻、過去日なら空。退場時刻は空。編集時は記録の値
  - 保存中はボタンを無効化して二重送信を防ぐ。成功したら通知（`toastSuccess`）を出して閉じ、`onSaved(result)` を呼ぶ
- **`SessionDeleteDialog`**（`session-delete-dialog.tsx`）: 既存の `AlertDialog` で「26001 たろう（田中太郎）の 10:05〜11:40 の記録を削除します。元に戻せません」と確認する
- **`SessionRowActions`**（`session-row-actions.tsx`）: 「…」の `DropdownMenu` から「編集」「削除」を開く。行クリック（利用者詳細を開く）と干渉しないよう `stopPropagation` する
- いずれも admin のときだけ描画する（`useMe().mentor.role === 'admin'`）

### 5.2 入口 A: ダッシュボード（`apps/admin/src/app/(authed)/page.tsx`）

- 来場一覧の見出しの横に「記録を追加」。日付の初期値は選択中の日（「本日」なら今日）
- PC の表に操作列を追加し、スマホのカードにも「…」メニューを付ける
- 変更後は来場一覧と日付の選択肢（`/api/events`）を読み込み直す（`reload({ background: true })`）。返ってきた `eventDate` が表示中の日と違えば、その日付へ表示を切り替える（今日なら「本日」）

### 5.3 入口 B: 利用者詳細（`apps/admin/src/components/participant-detail-sheet.tsx`）

- 「来場履歴」の見出しの横に「記録を追加」。子はその子、日付は今日で開く
- 履歴の各行に「…」メニュー
- 変更後は利用者詳細（参加回数などを含む）を読み込み直し、親に `onSessionsChanged` で通知する。ダッシュボードから開いた場合は、裏の来場一覧も読み込み直す

## 6. 非ゴール

- 修正の履歴・監査ログ（ユーザー決定により作らない）
- 受付端末（checkin）からの修正、admin 以外への権限付与
- 開催日そのもの（日付・メモ）の編集、複数記録の一括編集、重複記録の自動統合
- 受付経路（チェックイン・チェックアウト・スキャン・一括チェックアウト）の挙動変更

## 7. テスト

| 対象 | 方法 |
| --- | --- |
| `session-rules.ts` / JST 変換関数 | `packages/shared` の vitest（既存の 3 系）。先にテストを書く。境界（同時刻・境界で接する区間・1 分の猶予・日付の変わり目・滞在中の重なり）を網羅する |
| `session-admin.ts`（API の書き込み） | `apps/api` に vitest 4 系 + `@cloudflare/vitest-pool-workers`（0.23 系。peer が vitest ^4.1 のため、`packages/shared` の 3 系とは別に入れる）を導入する。`wrangler.toml` の D1 binding を使い、`packages/db/drizzle` のマイグレーションをテスト用 D1 に当ててから、lib の関数を直接呼ぶ。実行は `pnpm --filter @tecnova/api test` |
| 管理画面 | Playwright で API をモックし、実ブラウザで確認する（QR 修正と同じやり方）。コンソールエラー（無限再レンダー等）が無いことも確認する |

**API テストの主なケース**

- 追加: 開催日が無い日 → 開催日ができる／既存の開催日を再利用する／子が無い → `PARTICIPANT_NOT_FOUND`／無効化した子でも追加できる／重なり → `OVERLAP`／過去日の滞在中 → `OPEN_SESSION_NOT_TODAY`／未来 → `FUTURE_TIME`／検証エラー時に開催日が作られない
- 編集: 同じ日の時刻変更／日付変更で別の開催日へ移り、空になった過去の開催日が消える／付け替え先の子との重なり → `OVERLAP`／今日なら滞在中に戻せる・過去日は不可／記録が無い → `SESSION_NOT_FOUND`
- 削除: 記録が消える／過去の開催日の最後の 1 件なら開催日も消える／今日の開催日は空でも残る

**管理画面の主なケース**

- admin には「記録を追加」と「…」が出て、admin 以外には出ない
- 追加フォームが正しい ISO（JST → UTC）で POST する／その場の検証メッセージが出る／サーバーのエラー（`OVERLAP` 等）がダイアログに表示される
- 削除の確認を経て DELETE し、一覧が読み込み直される
- 利用者詳細から追加・編集すると、詳細と裏の一覧が読み込み直される

既存のテストスイート（`@tecnova/shared`）と `pnpm lint` / `pnpm type-check` も通す。`pre-pr-check` スキルに API のテスト実行を追加する。

## 8. ドキュメント更新とデリバリ

**ドキュメント（コードより先に更新する）**

- `docs/mvp.md`: §4.3（開催日の任意日付での作成・空になった過去の開催日の削除）、§6.2（新しい API 3 つとエラー）、§7.2.2 ダッシュボード・§7.2.3 利用者詳細（「編集は Phase 1.5」の記述を更新）、§9（「チェックイン忘れ・押し間違いを訂正する手段が無い」を削除）
- `docs/requirements.md` §3.2: 「チェックイン記録の修正」を実装済みにする
- `docs/handoff.md`: 実装後に更新（直近の優先事項から外し、API テストの実行方法を追記）

**コミットの単位**

1. ドキュメント（mvp.md / requirements.md）
2. shared: JST 変換関数と `session-rules.ts`（テスト込み）
3. shared: Zod スキーマ
4. api: vitest-pool-workers の導入
5. api: `getOrCreateEventByDate` への一般化
6. api: `session-admin.ts`（テスト込み）とルート・エラー表
7. ui: `dialog` の追加
8. admin: `ParticipantPicker` / `SessionFormDialog` / `SessionDeleteDialog` / `SessionRowActions`
9. admin: ダッシュボードへの組み込み
10. admin: 利用者詳細への組み込み
11. handoff と pre-pr-check の更新

**リリース**: マイグレーション不要。API は追加のみなので、API（Worker）と管理画面（Vercel）のどちらを先に出しても既存機能は壊れない。

## 9. リスクと注意点

- **受付中との競合**: 今日の滞在中の記録を admin が編集している間に受付端末でスキャンされると、受付側の判定（チェックイン／チェックアウト）が変わる。D1 では完全には防げないため、フォームの注意書きで運用上避けてもらう
- **集計は遡って変わる**: 参加回数・統計・サイネージの集計は参照時に計算するので、修正は即座に反映される（キャッシュの無効化は不要）。これは期待どおりの挙動
- **管理者が作った過去の開催日**は、サイネージの「前回の開催」の候補になる（実際に開催した日なので正しい挙動）
- **時刻の変換**は必ず `packages/shared` の関数を通す。管理画面はスマホからも使われるため、端末のタイムゾーンに依存しない変換にする
- **Workers の制約**: `session-admin.ts` は Node 専用 API を使わない（`workers-constraint-reviewer` で確認する）。個人情報の扱いは変えない（`privacy-reviewer` で確認する）

## 10. 参照

- データモデル・既存 API: `docs/mvp.md` §4・§6.2、`packages/db/src/schema.ts`
- 受付経路の書き込み: `apps/api/src/lib/checkin.ts`（`getOrCreateTodayEvent`・`processScanValue`・`recordBulkCheckOut`）
- 集計: `apps/api/src/lib/admin.ts`（`fetchSessionsForEvent`・`fetchParticipationSummary`）、`packages/shared/src/venue-schedule.ts`
- 既存の管理画面の操作パターン: `apps/admin/src/app/(authed)/mentors/page.tsx`・`pre-registrations/page.tsx`
