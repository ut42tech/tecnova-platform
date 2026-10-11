# チェックイン記録の修正機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin ロールのメンターが、管理画面（ダッシュボードと利用者詳細）から来場記録（`sessions`）を追加・編集・削除できるようにする。

**Architecture:** 守るべきルール（時刻の前後・同じ日・未来不可・滞在中は今日だけ・重なり禁止）を `packages/shared` の純粋関数にして、API と画面の両方で使う。API は `apps/api/src/lib/session-admin.ts` に書き込みロジックを置き、開催日の作成・記録の書き込み・空になった過去の開催日の削除を 1 回の `db.batch` にまとめる（D1 にトランザクションが無いため）。管理画面は共通の `SessionFormDialog` / `SessionDeleteDialog` / `SessionRowActions` を作り、ダッシュボードと利用者詳細の 2 か所から開く。

**Tech Stack:** Hono on Cloudflare Workers + D1 + Drizzle ORM / Zod 4 / Next.js 16 + React 19（admin）/ shadcn/ui（radix-maia）/ vitest 3（shared）・vitest 4 + `@cloudflare/vitest-plugin`（api）/ Playwright MCP（画面の実行時確認）

**Spec:** `docs/superpowers/specs/2026-10-11-checkin-record-correction-design.md`

## Global Constraints

- ブランチは `feat/admin-session-correction`（`fix/checkin-qr-on-demand-scan` の上に積んである）。`main` / `develop` に直接コミットしない。PR は `develop` 向け
- コミットはタスクごと。英語の `<type>: <subject>`、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- DB のテーブル構造は変えない（マイグレーションを作らない）
- 来場記録を書き換える API（POST / PATCH / DELETE）は admin のみ。`GET /api/sessions` と `GET /api/sessions/today` は今までどおり全メンター向け
- `apps/api/src/**` で Node 専用 API（`fs` / `path` / `process.env` など）を使わない。`apps/api/vitest.config.ts` は Node で動く設定ファイルなので `node:url` を使ってよい
- 時刻は DB に UTC（epoch ms）、API は ISO 8601（UTC）、画面の入力と表示は JST。JST ⇔ UTC の変換は必ず `@tecnova/shared/venue-schedule` の関数を通す
- テストデータの氏名・ニックネームは架空の値（`テスト26001` / `nick26001` / `テスト太郎` / `たろう` など）。実在の子ども・メンターの情報を入れない
- 追加する依存は版を固定する: `vitest@4.1.11`、`@cloudflare/vitest-plugin@1.2.8`（ともに `--save-exact`）、shadcn CLI は `shadcn@4.21.0`
- 受付経路（`apps/api/src/lib/checkin.ts` の check-in / check-out / scan / 一括チェックアウト）は変更しない
- コードは Biome（スペース 2・シングルクォート・セミコロン）、関数は arrow function、`any` 禁止、コメントは日本語で「なぜ」を書く
- admin の UI を作る前に `apps/admin/node_modules/next/dist/docs/` の該当ガイドを確認する（`apps/admin/AGENTS.md` の指示）。今回は App Router の API を新しく使わないが、Client Component の書き方に迷ったら参照する

## Review Focus

1. **別の日付に属する記録を保存したとき**、ダッシュボードの表示がその日付へ切り替わる（過去日に追加した直後に一覧から消えたように見えない）→ Task 11 の Playwright で確認
2. **行・カード全体がクリック可能な中の「…」メニュー**を押しても利用者詳細が開かない。スマホ幅ではカード全面のボタンより前面に出て押せる → Task 11 の Playwright（PC 幅とスマホ幅）で確認
3. **既存の「過去日に滞在中のまま」の記録**を、退場時刻を入れずに他の項目だけ直そうとすると `OPEN_SESSION_NOT_TODAY` で止まり、退場時刻を入れれば直る → Task 6 の API テストで確認
4. **admin 以外のメンター**が API を直接叩いても 403 になり、画面にもボタンが出ない → Task 8 のルートテストと Task 11 の Playwright で確認
5. **日付の変わり目付近の時刻**（JST の 0〜9 時は UTC では前日）が正しく変換され、開催日がずれない → Task 2 のテスト（`jstDateTimeToInstant` の早朝ケース）と Task 5 の API テスト（早朝の記録）で確認

---

### Task 1: ドキュメントを先に更新する（mvp.md）

**Files:**
- Modify: `docs/mvp.md`（§4.3 末尾、§6.2 の `GET /api/events` と `GET /api/participants` の間、§7.2.2、§9）

**Interfaces:**
- Consumes: なし
- Produces: 以降のタスクが従う API 契約（§6.2 に記載するもの）

- [ ] **Step 1: §4.3 の末尾に段落を追加する**

`docs/mvp.md` の「タイムゾーン注意: Workersのデフォルトタイムゾーンは…動作する（`UNIQUE` 制約に対する `ON CONFLICT DO NOTHING`）。」の段落の直後（`### 4.4` の前）に、空行をはさんで次を追加する。

````markdown
**管理画面からの記録修正での開催日**（admin・2026-10）: 来場記録の追加・編集では、入場時刻の JST 日付の開催日を `INSERT … ON CONFLICT(date) DO NOTHING` で作り、`event_id` は日付からのサブクエリで解決する（記録の書き込みと同じ `db.batch` 内）。編集・削除で記録が 1 件も無くなった**過去**の開催日は、同じ batch 内で削除する（今日の開催日は受付中のため残す）。詳細は §6.2「来場記録の修正」。
````

- [ ] **Step 2: §6.2 に API を追加する**

`#### \`GET /api/events\`` のレスポンス例（`{ "events": [...] }` のコードブロック）の直後、`#### \`GET /api/participants\`` の直前に次を追加する。

````markdown
#### `POST /api/sessions` / `PATCH /api/sessions/:sessionId` / `DELETE /api/sessions/:sessionId`（admin）— 来場記録の修正

受付の操作ミス（チェックイン忘れ・チェックアウト忘れ・別の子で受付・二重記録）を訂正するための、来場記録の追加・編集・削除。`GET /api/sessions` は全メンター向けのまま、この 3 つだけルート単位で `requireAdmin` を当てる。

**リクエスト**:

```json
// POST（追加）
{ "participantId": "26001", "checkedInAt": "2026-10-04T01:05:00.000Z", "checkedOutAt": "2026-10-04T02:40:00.000Z" }

// PATCH（編集。変える項目だけ・1 つ以上。checkedOutAt: null は「滞在中」に戻す）
{ "checkedOutAt": "2026-10-04T03:00:00.000Z" }
```

**レスポンス**: POST は 201、PATCH は 200 で次の形。DELETE は 204（本文なし）。

```json
{ "eventDate": "2026-10-04", "session": { "sessionId": "...", "participantId": "26001", "...": "todaySessionItem と同じ形" } }
```

**守るルール**（`packages/shared/src/session-rules.ts` を API と画面で共用）:

- 開催日は入場時刻の JST 日付から決める（無ければ作る。編集で日付が変われば、その日の開催日へ移す）
- 退場は入場より後、かつ同じ JST 日のうち。未来の時刻は不可（現在時刻 + 1 分まで許容）
- 「滞在中」（退場時刻なし）は今日の記録だけ
- 同じ子・同じ日の他の記録と時間が重ならない（半開区間 `[入場, 退場)`。滞在中は現在時刻まで続くとみなす）
- 無効化した子の記録も対象にできる
- 記録が無くなった過去の開催日は削除する（§4.3）

**エラー**（`{ "error": code, "message": 日本語 }`）: `SESSION_NOT_FOUND` 404 / `PARTICIPANT_NOT_FOUND` 404 / `CHECKOUT_BEFORE_CHECKIN` 400 / `SPANS_DAYS` 400 / `FUTURE_TIME` 400 / `OPEN_SESSION_NOT_TODAY` 400 / `OVERLAP` 409。本文の形式エラーは 400 `INTERNAL`。
````

- [ ] **Step 3: §7.2.2 ダッシュボードに追記する**

`#### 7.2.2 ダッシュボード` の箇条書きの最後（「行クリックで `ParticipantDetailSheet`…」の行）の後に次の 2 行を追加する。

````markdown
- **来場記録の修正（admin のみ）**: ヘッダーの「記録を追加」と、各行（PC の表・スマホのカード）の「…」メニュー（編集／削除）。フォームは中央のダイアログ（`SessionFormDialog`）、削除は確認ダイアログ（`SessionDeleteDialog`）。保存後は一覧と日付の選択肢を再取得し、記録が別の日付に属する場合はその日付へ表示を切り替える
- `ParticipantDetailSheet` の「来場履歴」にも admin のみ「記録を追加」（その子を選んだ状態・日付は今日）と各行の「…」メニュー。変更後は詳細とダッシュボードの一覧を再取得する
````

- [ ] **Step 3b: §7.2.3 参加者一覧の「閲覧専用」を言い直す**

`#### 7.2.3 参加者一覧` の `- 閲覧専用（編集は Phase 1.5）` を次に置き換える（来場記録は直せるようになったが、参加者の属性はまだ編集できないことを明確にする）。

````markdown
- 参加者の属性（氏名・ニックネーム・学年）は閲覧専用（編集は Phase 1.5）。行クリックで開く `ParticipantDetailSheet` から、admin は来場記録を修正できる（§7.2.2）
````

- [ ] **Step 4: §9 から解消する制約を消す**

`## 9. 運用上の既知の制約` から次の 1 行を削除する。

````markdown
- チェックイン忘れ・押し間違いをシステム上で訂正する手段がまだ無い（管理画面での追加・編集・削除を Phase 1.5 で実装予定）
````

- [ ] **Step 5: 差分を確認してコミットする**

Run: `git diff --stat docs/mvp.md`
Expected: `docs/mvp.md | ` の 1 ファイルだけが変わっている

```bash
git add docs/mvp.md
git commit -m "docs(mvp): specify admin check-in record correction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: shared — JST 変換関数と来場記録のルール

**Files:**
- Modify: `packages/shared/src/venue-schedule.ts`（`toJstDateString` の直後に 2 関数を追加）
- Create: `packages/shared/src/venue-schedule.test.ts`
- Create: `packages/shared/src/session-rules.ts`
- Create: `packages/shared/src/session-rules.test.ts`
- Modify: `packages/shared/package.json`（`exports` に `./session-rules`）

**Interfaces:**
- Consumes: 既存の `toJstWallClock(instant: Date): JstWallClock`、`toJstDateString(instant: Date): string`、モジュール内定数 `JST_OFFSET_HOURS = 9`
- Produces:
  - `jstDateTimeToInstant(date: string, time: string): Date`（`date` は `'YYYY-MM-DD'`、`time` は `'HH:mm'`、どちらも JST）
  - `toJstTimeString(instant: Date): string`（`'HH:mm'`、JST）
  - `type SessionRuleViolation = 'CHECKOUT_BEFORE_CHECKIN' | 'SPANS_DAYS' | 'FUTURE_TIME' | 'OPEN_SESSION_NOT_TODAY' | 'OVERLAP'`
  - `interface SessionTimes { checkedInAt: Date; checkedOutAt: Date | null }`
  - `FUTURE_TOLERANCE_MS = 60_000`
  - `validateSessionTimes(times: SessionTimes, now: Date): Exclude<SessionRuleViolation, 'OVERLAP'> | null`
  - `findOverlappingSession<T extends SessionTimes>(target: SessionTimes, siblings: readonly T[], now: Date): T | null`
  - `SESSION_RULE_MESSAGES: Record<SessionRuleViolation, string>`
  - import パス `@tecnova/shared/session-rules`

- [ ] **Step 1: JST 変換関数の失敗するテストを書く**

`packages/shared/src/venue-schedule.test.ts` を作る。

```ts
import { describe, expect, it } from 'vitest';
import { jstDateTimeToInstant, toJstDateString, toJstTimeString } from './venue-schedule';

describe('jstDateTimeToInstant', () => {
  it('JST の日付と時刻を UTC instant にする（UTC+9）', () => {
    expect(jstDateTimeToInstant('2026-10-11', '10:05').toISOString()).toBe(
      '2026-10-11T01:05:00.000Z',
    );
  });

  it('JST の早朝は UTC では前日になる', () => {
    expect(jstDateTimeToInstant('2026-10-11', '08:30').toISOString()).toBe(
      '2026-10-10T23:30:00.000Z',
    );
  });

  it('変換した instant を JST 日付に戻すと元の日付になる（深夜 0 時台）', () => {
    expect(toJstDateString(jstDateTimeToInstant('2026-10-11', '00:10'))).toBe('2026-10-11');
  });
});

describe('toJstTimeString', () => {
  it('UTC instant を JST の HH:mm にする', () => {
    expect(toJstTimeString(new Date('2026-10-10T23:30:00.000Z'))).toBe('08:30');
  });

  it('1 桁の時・分は 0 埋めする', () => {
    expect(toJstTimeString(new Date('2026-10-11T00:05:00.000Z'))).toBe('09:05');
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/shared test -- venue-schedule`
Expected: FAIL（`jstDateTimeToInstant` / `toJstTimeString` が export されていない）

- [ ] **Step 3: JST 変換関数を実装する**

`packages/shared/src/venue-schedule.ts` の `export const toJstDateString = …;` の直後に追加する。

```ts
// JST の日付 'YYYY-MM-DD' と時刻 'HH:mm' を UTC instant にする。管理画面で JST 入力した
// 来場時刻を API（ISO 8601 UTC）へ渡すときに使う。端末のタイムゾーンに依存させないため
// Date のローカル時刻 API は使わず、固定の UTC+9 を引いて Date.UTC で組み立てる。
export const jstDateTimeToInstant = (date: string, time: string): Date => {
  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(5, 7), 10);
  const day = Number.parseInt(date.slice(8, 10), 10);
  const hour = Number.parseInt(time.slice(0, 2), 10);
  const minute = Number.parseInt(time.slice(3, 5), 10);
  return new Date(Date.UTC(year, month - 1, day, hour - JST_OFFSET_HOURS, minute, 0, 0));
};

// UTC instant を JST の 'HH:mm' にする（フォームの初期値・表示用）。
export const toJstTimeString = (instant: Date): string => {
  const { hour, minute } = toJstWallClock(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/shared test -- venue-schedule`
Expected: PASS（5 tests）

- [ ] **Step 5: ルールの失敗するテストを書く**

`packages/shared/src/session-rules.test.ts` を作る。

```ts
import { describe, expect, it } from 'vitest';
import {
  findOverlappingSession,
  SESSION_RULE_MESSAGES,
  type SessionTimes,
  validateSessionTimes,
} from './session-rules';
import { jstDateTimeToInstant as jst } from './venue-schedule';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');

const times = (date: string, inTime: string, outTime: string | null): SessionTimes => ({
  checkedInAt: jst(date, inTime),
  checkedOutAt: outTime === null ? null : jst(date, outTime),
});

describe('validateSessionTimes', () => {
  it('過去日の入場〜退場がそろった記録は OK', () => {
    expect(validateSessionTimes(times(PAST, '10:00', '11:00'), NOW)).toBeNull();
  });

  it('退場が入場と同時刻なら CHECKOUT_BEFORE_CHECKIN', () => {
    expect(validateSessionTimes(times(PAST, '10:00', '10:00'), NOW)).toBe(
      'CHECKOUT_BEFORE_CHECKIN',
    );
  });

  it('退場が入場より前なら CHECKOUT_BEFORE_CHECKIN', () => {
    expect(validateSessionTimes(times(PAST, '11:00', '10:00'), NOW)).toBe(
      'CHECKOUT_BEFORE_CHECKIN',
    );
  });

  it('退場が入場と別の JST 日なら SPANS_DAYS', () => {
    const t = { checkedInAt: jst(PAST, '18:00'), checkedOutAt: jst('2026-10-05', '09:00') };
    expect(validateSessionTimes(t, NOW)).toBe('SPANS_DAYS');
  });

  it('入場が現在 + 1 分より後なら FUTURE_TIME', () => {
    const t = { checkedInAt: new Date(NOW.getTime() + 120_000), checkedOutAt: null };
    expect(validateSessionTimes(t, NOW)).toBe('FUTURE_TIME');
  });

  it('入場が現在 + 30 秒（猶予内）なら今日の滞在中として OK', () => {
    const t = { checkedInAt: new Date(NOW.getTime() + 30_000), checkedOutAt: null };
    expect(validateSessionTimes(t, NOW)).toBeNull();
  });

  it('退場が未来なら FUTURE_TIME', () => {
    expect(validateSessionTimes(times(TODAY, '14:00', '15:05'), NOW)).toBe('FUTURE_TIME');
  });

  it('今日の滞在中（退場なし）は OK', () => {
    expect(validateSessionTimes(times(TODAY, '14:00', null), NOW)).toBeNull();
  });

  it('過去日の滞在中は OPEN_SESSION_NOT_TODAY', () => {
    expect(validateSessionTimes(times(PAST, '10:00', null), NOW)).toBe('OPEN_SESSION_NOT_TODAY');
  });
});

describe('findOverlappingSession', () => {
  it('他の記録が無ければ null', () => {
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [], NOW)).toBeNull();
  });

  it('時間が重なる記録を返す', () => {
    const sibling = times(PAST, '10:30', '12:00');
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [sibling], NOW)).toBe(sibling);
  });

  it('境界で接するだけ（11:00 退場・11:00 入場）は重ならない', () => {
    const sibling = times(PAST, '11:00', '12:00');
    expect(findOverlappingSession(times(PAST, '10:00', '11:00'), [sibling], NOW)).toBeNull();
  });

  it('滞在中の記録は現在時刻まで続くとみなす', () => {
    const sibling = times(TODAY, '13:00', null);
    expect(findOverlappingSession(times(TODAY, '14:00', '14:30'), [sibling], NOW)).toBe(sibling);
  });

  it('滞在中どうしは重なる（同じ子の滞在中が 2 件になるのを防ぐ）', () => {
    const sibling = times(TODAY, '13:00', null);
    expect(findOverlappingSession(times(TODAY, '14:00', null), [sibling], NOW)).toBe(sibling);
  });

  it('滞在中の記録より前に終わった記録とは重ならない', () => {
    const sibling = times(TODAY, '10:00', '11:00');
    expect(findOverlappingSession(times(TODAY, '14:00', null), [sibling], NOW)).toBeNull();
  });
});

describe('SESSION_RULE_MESSAGES', () => {
  it('すべての違反に日本語の文言がある', () => {
    expect(SESSION_RULE_MESSAGES.CHECKOUT_BEFORE_CHECKIN).toBe(
      '退場時刻は入場時刻より後にしてください',
    );
    expect(Object.keys(SESSION_RULE_MESSAGES).sort()).toEqual([
      'CHECKOUT_BEFORE_CHECKIN',
      'FUTURE_TIME',
      'OPEN_SESSION_NOT_TODAY',
      'OVERLAP',
      'SPANS_DAYS',
    ]);
  });
});
```

- [ ] **Step 6: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/shared test -- session-rules`
Expected: FAIL（`./session-rules` が存在しない）

- [ ] **Step 7: ルールを実装する**

`packages/shared/src/session-rules.ts` を作る。

```ts
import { toJstDateString } from './venue-schedule';

// 管理画面からの来場記録の追加・編集で守るルール。DB に制約（CHECK・一意制約）が無いため、
// API（apps/api/src/lib/session-admin.ts）と画面（SessionFormDialog）の両方がこの純粋関数で検証する。
// 設計: docs/superpowers/specs/2026-10-11-checkin-record-correction-design.md §2

export type SessionRuleViolation =
  | 'CHECKOUT_BEFORE_CHECKIN'
  | 'SPANS_DAYS'
  | 'FUTURE_TIME'
  | 'OPEN_SESSION_NOT_TODAY'
  | 'OVERLAP';

export interface SessionTimes {
  checkedInAt: Date;
  // null = 滞在中（まだ退場していない）
  checkedOutAt: Date | null;
}

// 端末の時計ずれで「今」入力した時刻が未来扱いにならないための猶予。
export const FUTURE_TOLERANCE_MS = 60_000;

// 時刻だけで判定できるルール（重なり以外）を検証する。違反が無ければ null。
export const validateSessionTimes = (
  times: SessionTimes,
  now: Date,
): Exclude<SessionRuleViolation, 'OVERLAP'> | null => {
  const limit = now.getTime() + FUTURE_TOLERANCE_MS;
  if (times.checkedInAt.getTime() > limit) return 'FUTURE_TIME';
  if (times.checkedOutAt !== null && times.checkedOutAt.getTime() > limit) return 'FUTURE_TIME';

  if (times.checkedOutAt !== null) {
    if (times.checkedOutAt.getTime() <= times.checkedInAt.getTime()) {
      return 'CHECKOUT_BEFORE_CHECKIN';
    }
    // 参加回数の集計は「開催日 = 入場日」で行うため、日をまたぐ記録は作らない。
    if (toJstDateString(times.checkedOutAt) !== toJstDateString(times.checkedInAt)) {
      return 'SPANS_DAYS';
    }
    return null;
  }

  // 過去日に滞在中の記録が残ると、その日の一覧で「来場中」と表示され続けるため今日だけに許す。
  if (toJstDateString(times.checkedInAt) !== toJstDateString(now)) {
    return 'OPEN_SESSION_NOT_TODAY';
  }
  return null;
};

// 区間 [入場, 退場) の終端。滞在中は「今」まで続いているとみなす。
const intervalEnd = (times: SessionTimes, now: Date): number =>
  Math.max(times.checkedInAt.getTime(), (times.checkedOutAt ?? now).getTime());

// 同じ子・同じ日の他の記録（siblings）のうち、target と時間が重なるものを 1 件返す。
// 境界で接する（11:00 退場・11:00 入場）のは重ならない扱い。
export const findOverlappingSession = <T extends SessionTimes>(
  target: SessionTimes,
  siblings: readonly T[],
  now: Date,
): T | null => {
  const start = target.checkedInAt.getTime();
  const end = intervalEnd(target, now);
  return (
    siblings.find((s) => start < intervalEnd(s, now) && s.checkedInAt.getTime() < end) ?? null
  );
};

// 画面と API のエラー文言をそろえるため、違反ごとの日本語をここに集約する。
export const SESSION_RULE_MESSAGES: Record<SessionRuleViolation, string> = {
  CHECKOUT_BEFORE_CHECKIN: '退場時刻は入場時刻より後にしてください',
  SPANS_DAYS: '入場と退場は同じ日の時刻にしてください',
  FUTURE_TIME: '未来の時刻は入力できません',
  OPEN_SESSION_NOT_TODAY: '過去の日の記録には退場時刻が必要です',
  OVERLAP: '同じ子の同じ日の別の記録と時間が重なっています',
};
```

`packages/shared/package.json` の `exports` に 1 行追加する（`"./visit-summary"` の行の後）。

```json
    "./session-rules": "./src/session-rules.ts",
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/shared test`
Expected: PASS（既存の 31 件 + 新規 21 件。失敗 0）

Run: `pnpm --filter @tecnova/shared type-check && pnpm biome check packages/shared`
Expected: エラーなし

- [ ] **Step 9: コミットする**

```bash
git add packages/shared/src/venue-schedule.ts packages/shared/src/venue-schedule.test.ts packages/shared/src/session-rules.ts packages/shared/src/session-rules.test.ts packages/shared/package.json
git commit -m "feat(shared): add JST time helpers and session record rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: shared — リクエスト／レスポンスの Zod スキーマ

**Files:**
- Modify: `packages/shared/src/schemas/admin.ts`（`createPreRegistrationRequestSchema` の後にスキーマ、ファイル末尾に型）
- Create: `packages/shared/src/schemas/session-requests.test.ts`

**Interfaces:**
- Consumes: 既存の `todaySessionItemSchema`（同ファイル）
- Produces:
  - `createSessionRequestSchema`（`{ participantId: string; checkedInAt: string; checkedOutAt: string | null }`）
  - `updateSessionRequestSchema`（`{ participantId?: string; checkedInAt?: string; checkedOutAt?: string | null }`、1 項目以上）
  - `sessionMutationResponseSchema`（`{ eventDate: string; session: TodaySessionItem }`）
  - 型 `CreateSessionRequest` / `UpdateSessionRequest` / `SessionMutationResponse`（`@tecnova/shared/schemas` から import）

- [ ] **Step 1: 失敗するテストを書く**

`packages/shared/src/schemas/session-requests.test.ts` を作る。

```ts
import { describe, expect, it } from 'vitest';
import { createSessionRequestSchema, updateSessionRequestSchema } from './admin';

describe('createSessionRequestSchema', () => {
  it('5 桁の ID と ISO 時刻を受け付ける（退場は null 可）', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '26001',
      checkedInAt: '2026-10-04T01:05:00.000Z',
      checkedOutAt: null,
    });
    expect(r.success).toBe(true);
  });

  it('5 桁でない ID は弾く', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '2601',
      checkedInAt: '2026-10-04T01:05:00.000Z',
      checkedOutAt: null,
    });
    expect(r.success).toBe(false);
  });

  it('ISO でない時刻は弾く', () => {
    const r = createSessionRequestSchema.safeParse({
      participantId: '26001',
      checkedInAt: '2026-10-04 10:05',
      checkedOutAt: null,
    });
    expect(r.success).toBe(false);
  });
});

describe('updateSessionRequestSchema', () => {
  it('項目が 1 つも無いと弾く', () => {
    expect(updateSessionRequestSchema.safeParse({}).success).toBe(false);
  });

  it('checkedOutAt: null だけでも受け付ける（滞在中に戻す）', () => {
    expect(updateSessionRequestSchema.safeParse({ checkedOutAt: null }).success).toBe(true);
  });

  it('付け替え（participantId だけ）を受け付ける', () => {
    expect(updateSessionRequestSchema.safeParse({ participantId: '26002' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/shared test -- session-requests`
Expected: FAIL（`createSessionRequestSchema` が export されていない）

- [ ] **Step 3: スキーマを実装する**

`packages/shared/src/schemas/admin.ts` の `createPreRegistrationRequestSchema` の定義の後（型 export の並びの前）に追加する。

```ts
// `/api/sessions`（POST / PATCH・admin role 専用）— 来場記録の修正
// 時刻は ISO 8601（UTC・末尾 Z）。画面は JST で入力し、shared の jstDateTimeToInstant で変換して送る。
const sessionParticipantIdSchema = z.string().regex(/^\d{5}$/, '5-digit participant id required');
const sessionInstantSchema = z.iso.datetime();

export const createSessionRequestSchema = z.object({
  participantId: sessionParticipantIdSchema,
  checkedInAt: sessionInstantSchema,
  // null = 滞在中（今日の記録だけ許す。判定は session-rules）
  checkedOutAt: sessionInstantSchema.nullable(),
});

// 変える項目だけを送る。checkedOutAt は「省略 = 変えない」「null = 滞在中に戻す」を区別する。
export const updateSessionRequestSchema = z
  .object({
    participantId: sessionParticipantIdSchema.optional(),
    checkedInAt: sessionInstantSchema.optional(),
    checkedOutAt: sessionInstantSchema.nullable().optional(),
  })
  .refine(
    (v) =>
      v.participantId !== undefined || v.checkedInAt !== undefined || v.checkedOutAt !== undefined,
    { message: 'at least one of participantId, checkedInAt, checkedOutAt is required' },
  );

// eventDate は記録が属する開催日。画面が表示中の日付を切り替えるために返す。
export const sessionMutationResponseSchema = z.object({
  eventDate: z.string(), // 'YYYY-MM-DD' (JST)
  session: todaySessionItemSchema,
});
```

ファイル末尾の型 export の並びに追加する。

```ts
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;
export type SessionMutationResponse = z.infer<typeof sessionMutationResponseSchema>;
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/shared test`
Expected: PASS（失敗 0）

Run: `pnpm --filter @tecnova/shared type-check && pnpm biome check packages/shared`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add packages/shared/src/schemas/admin.ts packages/shared/src/schemas/session-requests.test.ts
git commit -m "feat(shared): add session correction request/response schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: api — テストの仕組み（`@cloudflare/vitest-plugin`）を入れる

**Files:**
- Modify: `apps/api/package.json`（devDependencies と `test` スクリプト。CLI で追加）
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/test/apply-migrations.ts`
- Create: `apps/api/test/env.d.ts`
- Create: `apps/api/test/tsconfig.json`
- Create: `apps/api/test/helpers.ts`
- Create: `apps/api/test/smoke.test.ts`

**Interfaces:**
- Consumes: `apps/api/wrangler.toml`（D1 binding `DB`）、`packages/db/drizzle/*.sql`（マイグレーション）、`@tecnova/shared/venue-schedule` の `jstDateTimeToInstant`
- Produces（`apps/api/test/helpers.ts`）:
  - `testDb(): TestDb` / `type TestDb`（`drizzle(env.DB, { schema })`）
  - `resetTables(db: TestDb): Promise<void>`
  - `seedParticipant(db: TestDb, id: string, active?: boolean): Promise<void>`
  - `seedSession(db: TestDb, input: { participantId: string; date: string; inTime: string; outTime: string | null }): Promise<string>`（作った session の id を返す）
  - `jst(date: string, time: string): Date`
  - `eventDates(db: TestDb): Promise<string[]>`（昇順）
  - 実行コマンド `pnpm --filter @tecnova/api test`

- [ ] **Step 1: 依存を追加する**

Run: `pnpm --filter @tecnova/api add -D --save-exact vitest@4.1.11 @cloudflare/vitest-plugin@1.2.8`
Expected: `apps/api/package.json` の devDependencies に `"vitest": "4.1.11"` と `"@cloudflare/vitest-plugin": "1.2.8"` が入る

`apps/api/package.json` の `scripts` に追加する（`type-check` の後）。

```json
    "test": "vitest run",
```

- [ ] **Step 2: 設定ファイルとマイグレーション適用を書く**

`apps/api/vitest.config.ts` を作る。

```ts
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// このファイルは Node で動く（Worker 本体 src/ の Node API 禁止ルールの対象外）。
// 本番と同じ wrangler.toml の D1 binding を使い、packages/db のマイグレーションを
// テスト専用 binding（TEST_MIGRATIONS）で setup ファイルへ渡して適用する。
const migrationsDir = fileURLToPath(new URL('../../packages/db/drizzle', import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations(migrationsDir) },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
```

`apps/api/test/apply-migrations.ts` を作る。

```ts
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// 適用済みのマイグレーションは d1_migrations テーブルで記録されるので、ファイルごとに呼んでも重複しない。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`apps/api/test/env.d.ts` を作る。

```ts
import type { D1Migration } from 'cloudflare:test';

// テストから見える env（cloudflare:workers の env は Cloudflare.Env 型）に binding を足す。
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
```

`apps/api/test/tsconfig.json` を作る。

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

- [ ] **Step 3: テスト用ヘルパーを書く**

`apps/api/test/helpers.ts` を作る。

```ts
import * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import { jstDateTimeToInstant } from '@tecnova/shared/venue-schedule';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export const testDb = () => drizzle(env.DB, { schema });
export type TestDb = ReturnType<typeof testDb>;

export const jst = (date: string, time: string): Date => jstDateTimeToInstant(date, time);

// D1 のデータがテスト間でリセットされるかは公式に明記されていないため、各テストの前に明示的に空にする。
// sessions は participants / events を FK で参照するので子テーブルから消す。
export const resetTables = async (db: TestDb): Promise<void> => {
  await db.delete(sessions);
  await db.delete(events);
  await db.delete(participants);
};

// Public リポジトリのため、氏名・ニックネームは実在しない値にする。
export const seedParticipant = async (db: TestDb, id: string, active = true): Promise<void> => {
  await db.insert(participants).values({
    id,
    preRegistrationId: `PRE-TEST-${id}`,
    fullName: `テスト${id}`,
    nickname: `nick${id}`,
    grade: '小3',
    active,
  });
};

// 受付経路を通さずに既存データ（過去日の滞在中など）を再現するため、DB へ直接入れる。
export const seedSession = async (
  db: TestDb,
  input: { participantId: string; date: string; inTime: string; outTime: string | null },
): Promise<string> => {
  await db.insert(events).values({ date: input.date }).onConflictDoNothing();
  const [event] = await db.select().from(events).where(eq(events.date, input.date)).limit(1);
  if (!event) throw new Error(`failed to seed event ${input.date}`);
  const id = crypto.randomUUID();
  await db.insert(sessions).values({
    id,
    participantId: input.participantId,
    eventId: event.id,
    checkedInAt: jst(input.date, input.inTime),
    checkedOutAt: input.outTime === null ? null : jst(input.date, input.outTime),
  });
  return id;
};

export const eventDates = async (db: TestDb): Promise<string[]> =>
  (await db.select({ date: events.date }).from(events)).map((e) => e.date).sort();
```

- [ ] **Step 4: 仕組みが動くことを確かめる smoke テストを書いて実行する**

`apps/api/test/smoke.test.ts` を作る。

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { eventDates, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const db = testDb();

describe('test D1', () => {
  beforeEach(async () => {
    await resetTables(db);
  });

  it('マイグレーション済みのテーブルに書き込める', async () => {
    await seedParticipant(db, '26001');
    await seedSession(db, { participantId: '26001', date: '2026-10-04', inTime: '10:00', outTime: '11:00' });
    expect(await eventDates(db)).toEqual(['2026-10-04']);
  });

  it('前のテストのデータは resetTables で消えている', async () => {
    expect(await eventDates(db)).toEqual([]);
  });
});
```

Run: `pnpm --filter @tecnova/api test`
Expected: PASS（2 tests）

Run: `pnpm --filter @tecnova/api exec tsc --noEmit -p test/tsconfig.json`
Expected: エラーなし。`cloudflare:test` / `cloudflare:workers` の型が二重定義でぶつかる場合は、`test/tsconfig.json` の `types` から `"@cloudflare/workers-types"` を外して再実行し、通った方を採用する

- [ ] **Step 5: テストの型チェックを type-check に含める**

`apps/api/package.json` の `type-check` を次に変える（CI の `pnpm type-check` でテストも型検査されるようにする）。

```json
    "type-check": "tsc --noEmit && tsc --noEmit -p test/tsconfig.json",
```

Run: `pnpm --filter @tecnova/api type-check && pnpm biome check apps/api`
Expected: エラーなし

- [ ] **Step 6: コミットする**

```bash
git add apps/api/package.json apps/api/vitest.config.ts apps/api/test pnpm-lock.yaml
git commit -m "test(api): add Workers vitest integration with migrated D1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: api — 来場記録の追加（`createSessionByAdmin`）

**Files:**
- Create: `apps/api/src/lib/session-admin.ts`
- Create: `apps/api/test/session-admin.create.test.ts`

**Interfaces:**
- Consumes: Task 2 の `validateSessionTimes` / `findOverlappingSession` / `SESSION_RULE_MESSAGES` / `SessionRuleViolation` / `SessionTimes`、Task 3 の `CreateSessionRequest` / `SessionMutationResponse`、Task 4 の test helpers
- Produces:
  - `type SessionErrorCode = 'SESSION_NOT_FOUND' | 'PARTICIPANT_NOT_FOUND' | SessionRuleViolation`
  - `class SessionError extends Error { code: SessionErrorCode }`
  - `createSessionByAdmin(db: Db, input: CreateSessionRequest, now: Date): Promise<SessionMutationResponse>`
  - モジュール内ヘルパー（Task 6・7 で使う）: `requireParticipant`、`findSiblingSessions(db, participantId, date, excludeSessionId?)`、`assertSessionRules(times, siblings, now)`、`ensureEvent(db, date)`、`eventIdOf(date)`、`toResponse(db, sessionId)`、`parseCheckedOutAt(value)`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/test/session-admin.create.test.ts` を作る。

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');
const db = testDb();

const input = (participantId: string, date: string, inTime: string, outTime: string | null) => ({
  participantId,
  checkedInAt: jst(date, inTime).toISOString(),
  checkedOutAt: outTime === null ? null : jst(date, outTime).toISOString(),
});

describe('createSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
  });

  it('開催日が無い日に追加すると開催日を作り、記録を返す', async () => {
    const r = await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(r.eventDate).toBe(PAST);
    expect(r.session).toMatchObject({
      participantId: '26001',
      checkedInAt: jst(PAST, '10:00').toISOString(),
      checkedOutAt: jst(PAST, '11:00').toISOString(),
      isPresent: false,
      term: 'morning',
      counted: true,
    });
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('既存の開催日を再利用する', async () => {
    await seedSession(db, { participantId: '26002', date: PAST, inTime: '10:00', outTime: '11:00' });
    await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('JST の早朝（UTC では前日）の記録も JST の日付の開催日に入る', async () => {
    const r = await createSessionByAdmin(db, input('26001', PAST, '08:30', '08:50'), NOW);
    expect(r.eventDate).toBe(PAST);
  });

  it('存在しない子は PARTICIPANT_NOT_FOUND', async () => {
    await expect(
      createSessionByAdmin(db, input('26999', PAST, '10:00', '11:00'), NOW),
    ).rejects.toMatchObject({ name: 'SessionError', code: 'PARTICIPANT_NOT_FOUND' });
  });

  it('無効化した子にも追加できる', async () => {
    await seedParticipant(db, '26003', false);
    const r = await createSessionByAdmin(db, input('26003', PAST, '10:00', '11:00'), NOW);
    expect(r.session.participantId).toBe('26003');
  });

  it('同じ子・同じ日の記録と重なると OVERLAP', async () => {
    await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:30', outTime: '12:00' });
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW),
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('別の子の記録とは重なってもよい', async () => {
    await seedSession(db, { participantId: '26002', date: PAST, inTime: '10:30', outTime: '12:00' });
    const r = await createSessionByAdmin(db, input('26001', PAST, '10:00', '11:00'), NOW);
    expect(r.session.participantId).toBe('26001');
  });

  it('過去日の滞在中は OPEN_SESSION_NOT_TODAY', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '10:00', null), NOW),
    ).rejects.toMatchObject({ code: 'OPEN_SESSION_NOT_TODAY' });
  });

  it('今日の滞在中は追加できる', async () => {
    const r = await createSessionByAdmin(db, input('26001', TODAY, '14:00', null), NOW);
    expect(r.session.isPresent).toBe(true);
    expect(r.eventDate).toBe(TODAY);
  });

  it('未来の時刻は FUTURE_TIME', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', TODAY, '16:00', null), NOW),
    ).rejects.toMatchObject({ code: 'FUTURE_TIME' });
  });

  it('検証エラーのときは開催日を作らない', async () => {
    await expect(
      createSessionByAdmin(db, input('26001', PAST, '11:00', '10:00'), NOW),
    ).rejects.toMatchObject({ code: 'CHECKOUT_BEFORE_CHECKIN' });
    expect(await eventDates(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/api test -- session-admin.create`
Expected: FAIL（`../src/lib/session-admin` が存在しない）

- [ ] **Step 3: 実装する**

`apps/api/src/lib/session-admin.ts` を作る。

```ts
import type * as schema from '@tecnova/db';
import { events, participants, sessions } from '@tecnova/db';
import type { CreateSessionRequest, SessionMutationResponse } from '@tecnova/shared/schemas';
import {
  findOverlappingSession,
  SESSION_RULE_MESSAGES,
  type SessionRuleViolation,
  type SessionTimes,
  validateSessionTimes,
} from '@tecnova/shared/session-rules';
import { classifyVisit, toJstDateString } from '@tecnova/shared/venue-schedule';
import { and, eq, ne, type SQL, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

type Db = DrizzleD1Database<typeof schema>;

// 管理画面からの来場記録の追加・編集・削除（admin 専用）。受付の操作ミスを訂正するためのもの。
// DB に制約が無いため、ルールはここと packages/shared/src/session-rules.ts で守る。
// D1 にトランザクションが無いので、開催日の作成・記録の書き込み・空の開催日の削除は 1 回の db.batch にまとめる。
// 設計: docs/superpowers/specs/2026-10-11-checkin-record-correction-design.md

export type SessionErrorCode = 'SESSION_NOT_FOUND' | 'PARTICIPANT_NOT_FOUND' | SessionRuleViolation;

export class SessionError extends Error {
  constructor(
    public code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

const sessionNotFound = () => new SessionError('SESSION_NOT_FOUND', '記録が見つかりません');

// 無効化した子も対象にする（過去の記録を直す場面があるため。受付端末側は従来どおり受け付けない）。
const requireParticipant = async (db: Db, participantId: string): Promise<void> => {
  const [found] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!found) {
    throw new SessionError('PARTICIPANT_NOT_FOUND', `ID ${participantId} の子が見つかりません`);
  }
};

// 同じ子・同じ開催日（JST）の既存記録。編集時は自分自身を除く。
const findSiblingSessions = async (
  db: Db,
  participantId: string,
  date: string,
  excludeSessionId?: string,
): Promise<SessionTimes[]> => {
  const conditions: SQL[] = [eq(sessions.participantId, participantId), eq(events.date, date)];
  if (excludeSessionId !== undefined) conditions.push(ne(sessions.id, excludeSessionId));
  return db
    .select({ checkedInAt: sessions.checkedInAt, checkedOutAt: sessions.checkedOutAt })
    .from(sessions)
    .innerJoin(events, eq(sessions.eventId, events.id))
    .where(and(...conditions));
};

const assertSessionRules = (
  times: SessionTimes,
  siblings: readonly SessionTimes[],
  now: Date,
): void => {
  const violation: SessionRuleViolation | null =
    validateSessionTimes(times, now) ??
    (findOverlappingSession(times, siblings, now) ? 'OVERLAP' : null);
  if (violation) throw new SessionError(violation, SESSION_RULE_MESSAGES[violation]);
};

// 開催日の get-or-create（batch 用の文）。events.date は UNIQUE なので既にあれば何もしない。
const ensureEvent = (db: Db, date: string) =>
  db.insert(events).values({ date }).onConflictDoNothing();

// date の開催日 id。batch 内で ensureEvent の後に評価されるので必ず見つかる。
const eventIdOf = (date: string): SQL<string> =>
  sql<string>`(select ${events.id} from ${events} where ${events.date} = ${date})`;

const parseCheckedOutAt = (value: string | null): Date | null =>
  value === null ? null : new Date(value);

// 一覧（GET /api/sessions）と同じ形で返す。ターム・30分ルールは venue-schedule に集約。
const toResponse = async (db: Db, sessionId: string): Promise<SessionMutationResponse> => {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      participantId: sessions.participantId,
      fullName: participants.fullName,
      nickname: participants.nickname,
      grade: participants.grade,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
      eventDate: events.date,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .innerJoin(events, eq(sessions.eventId, events.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) throw sessionNotFound();
  const { term, counted } = classifyVisit(row.checkedInAt);
  return {
    eventDate: row.eventDate,
    session: {
      sessionId: row.sessionId,
      participantId: row.participantId,
      fullName: row.fullName,
      nickname: row.nickname,
      grade: row.grade,
      checkedInAt: row.checkedInAt.toISOString(),
      checkedOutAt: row.checkedOutAt ? row.checkedOutAt.toISOString() : null,
      isPresent: row.checkedOutAt === null,
      term,
      counted,
    },
  };
};

export const createSessionByAdmin = async (
  db: Db,
  input: CreateSessionRequest,
  now: Date,
): Promise<SessionMutationResponse> => {
  await requireParticipant(db, input.participantId);
  const times: SessionTimes = {
    checkedInAt: new Date(input.checkedInAt),
    checkedOutAt: parseCheckedOutAt(input.checkedOutAt),
  };
  // 開催日は入場時刻の JST 日付から決める（集計が「開催日 = 入場日」を前提にしているため）。
  const date = toJstDateString(times.checkedInAt);
  assertSessionRules(times, await findSiblingSessions(db, input.participantId, date), now);

  // 検証を通ってから開催日を作るので、検証エラーで空の開催日は残らない。
  const id = crypto.randomUUID();
  await db.batch([
    ensureEvent(db, date),
    db.insert(sessions).values({
      id,
      participantId: input.participantId,
      eventId: eventIdOf(date),
      checkedInAt: times.checkedInAt,
      checkedOutAt: times.checkedOutAt,
    }),
  ]);
  return toResponse(db, id);
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/api test`
Expected: PASS（smoke 2 件 + create 11 件）

Run: `pnpm --filter @tecnova/api type-check && pnpm biome check apps/api`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add apps/api/src/lib/session-admin.ts apps/api/test/session-admin.create.test.ts
git commit -m "feat(api): add admin session creation with rule validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: api — 来場記録の編集（`updateSessionByAdmin`）

**Files:**
- Modify: `apps/api/src/lib/session-admin.ts`（import に `UpdateSessionRequest` を追加し、関数を追加）
- Create: `apps/api/test/session-admin.update.test.ts`

**Interfaces:**
- Consumes: Task 5 の `SessionError` / `requireParticipant` / `findSiblingSessions` / `assertSessionRules` / `ensureEvent` / `eventIdOf` / `toResponse` / `parseCheckedOutAt` / `sessionNotFound`、Task 3 の `UpdateSessionRequest`
- Produces:
  - `updateSessionByAdmin(db: Db, sessionId: string, patch: UpdateSessionRequest, now: Date): Promise<SessionMutationResponse>`
  - モジュール内ヘルパー（Task 7 で使う）: `deleteEventIfEmptyPast(db: Db, eventId: string, today: string)`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/test/session-admin.update.test.ts` を作る。

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { updateSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const OTHER_PAST = '2026-10-05';
const NOW = jst(TODAY, '15:00');
const db = testDb();
const iso = (date: string, time: string) => jst(date, time).toISOString();

describe('updateSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
    await seedParticipant(db, '26003');
  });

  it('同じ日のまま退場時刻を直せる（自分自身とは重ならない扱い）', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: iso(PAST, '11:30') }, NOW);
    expect(r.session.checkedOutAt).toBe(iso(PAST, '11:30'));
    expect(r.eventDate).toBe(PAST);
  });

  it('日付を変えると別の開催日へ移り、空になった過去の開催日は消える', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    const r = await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(OTHER_PAST, '10:00'), checkedOutAt: iso(OTHER_PAST, '11:00') },
      NOW,
    );
    expect(r.eventDate).toBe(OTHER_PAST);
    expect(await eventDates(db)).toEqual([OTHER_PAST]);
  });

  it('元の開催日に他の記録が残っていれば消さない', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await seedSession(db, { participantId: '26002', date: PAST, inTime: '10:00', outTime: '11:00' });
    await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(OTHER_PAST, '10:00'), checkedOutAt: iso(OTHER_PAST, '11:00') },
      NOW,
    );
    expect(await eventDates(db)).toEqual([PAST, OTHER_PAST]);
  });

  it('今日の開催日は空になっても残す', async () => {
    const id = await seedSession(db, { participantId: '26001', date: TODAY, inTime: '10:00', outTime: '11:00' });
    await updateSessionByAdmin(
      db,
      id,
      { checkedInAt: iso(PAST, '10:00'), checkedOutAt: iso(PAST, '11:00') },
      NOW,
    );
    expect(await eventDates(db)).toEqual([PAST, TODAY]);
  });

  it('付け替え先の子の記録と重なると OVERLAP', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await seedSession(db, { participantId: '26002', date: PAST, inTime: '10:30', outTime: '12:00' });
    await expect(
      updateSessionByAdmin(db, id, { participantId: '26002' }, NOW),
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('重ならない子へは付け替えられる', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    const r = await updateSessionByAdmin(db, id, { participantId: '26003' }, NOW);
    expect(r.session.participantId).toBe('26003');
    expect(r.session.nickname).toBe('nick26003');
  });

  it('存在しない子への付け替えは PARTICIPANT_NOT_FOUND', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await expect(
      updateSessionByAdmin(db, id, { participantId: '26999' }, NOW),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_FOUND' });
  });

  it('今日の記録は滞在中に戻せる', async () => {
    const id = await seedSession(db, { participantId: '26001', date: TODAY, inTime: '10:00', outTime: '11:00' });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: null }, NOW);
    expect(r.session.isPresent).toBe(true);
  });

  it('過去日の記録を滞在中に戻すのは OPEN_SESSION_NOT_TODAY', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await expect(
      updateSessionByAdmin(db, id, { checkedOutAt: null }, NOW),
    ).rejects.toMatchObject({ code: 'OPEN_SESSION_NOT_TODAY' });
  });

  it('過去日に滞在中のまま残った記録は、退場時刻を入れずに直そうとすると止まり、入れれば直る', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: null });
    await expect(
      updateSessionByAdmin(db, id, { checkedInAt: iso(PAST, '10:15') }, NOW),
    ).rejects.toMatchObject({ code: 'OPEN_SESSION_NOT_TODAY' });
    const r = await updateSessionByAdmin(db, id, { checkedOutAt: iso(PAST, '11:00') }, NOW);
    expect(r.session.isPresent).toBe(false);
  });

  it('存在しない記録は SESSION_NOT_FOUND', async () => {
    await expect(
      updateSessionByAdmin(db, 'no-such-session', { checkedOutAt: null }, NOW),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/api test -- session-admin.update`
Expected: FAIL（`updateSessionByAdmin` が export されていない）

- [ ] **Step 3: 実装する**

`apps/api/src/lib/session-admin.ts` の schemas の import を次に変える。

```ts
import type {
  CreateSessionRequest,
  SessionMutationResponse,
  UpdateSessionRequest,
} from '@tecnova/shared/schemas';
```

`parseCheckedOutAt` の直後に追加する。

```ts
// 記録が 1 件も無くなった過去の開催日を消す（日付の選択肢・サイネージの「前回の開催」に空の日を残さない）。
// 今日の開催日は受付中のチェックインと競合させないため消さない。
const deleteEventIfEmptyPast = (db: Db, eventId: string, today: string) =>
  db
    .delete(events)
    .where(
      and(
        eq(events.id, eventId),
        ne(events.date, today),
        sql`not exists (select 1 from ${sessions} where ${sessions.eventId} = ${eventId})`,
      ),
    );

// PATCH の checkedOutAt は「省略 = 変えない」「null = 滞在中に戻す」を区別する。
const resolveCheckedOutAt = (
  patch: UpdateSessionRequest['checkedOutAt'],
  current: Date | null,
): Date | null => (patch === undefined ? current : parseCheckedOutAt(patch));
```

ファイル末尾（`createSessionByAdmin` の後）に追加する。

```ts
export const updateSessionByAdmin = async (
  db: Db,
  sessionId: string,
  patch: UpdateSessionRequest,
  now: Date,
): Promise<SessionMutationResponse> => {
  const [current] = await db
    .select({
      participantId: sessions.participantId,
      eventId: sessions.eventId,
      checkedInAt: sessions.checkedInAt,
      checkedOutAt: sessions.checkedOutAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!current) throw sessionNotFound();

  const participantId = patch.participantId ?? current.participantId;
  if (participantId !== current.participantId) await requireParticipant(db, participantId);

  const times: SessionTimes = {
    checkedInAt: patch.checkedInAt === undefined ? current.checkedInAt : new Date(patch.checkedInAt),
    checkedOutAt: resolveCheckedOutAt(patch.checkedOutAt, current.checkedOutAt),
  };
  const date = toJstDateString(times.checkedInAt);
  assertSessionRules(times, await findSiblingSessions(db, participantId, date, sessionId), now);

  await db.batch([
    ensureEvent(db, date),
    db
      .update(sessions)
      .set({
        participantId,
        eventId: eventIdOf(date),
        checkedInAt: times.checkedInAt,
        checkedOutAt: times.checkedOutAt,
      })
      .where(eq(sessions.id, sessionId)),
    // 日付が変わって元の開催日が空になった場合だけ消える（同じ日なら NOT EXISTS で何もしない）。
    deleteEventIfEmptyPast(db, current.eventId, toJstDateString(now)),
  ]);
  return toResponse(db, sessionId);
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/api test`
Expected: PASS（smoke 2 + create 11 + update 11）

Run: `pnpm --filter @tecnova/api type-check && pnpm biome check apps/api`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add apps/api/src/lib/session-admin.ts apps/api/test/session-admin.update.test.ts
git commit -m "feat(api): add admin session update with event move and cleanup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: api — 来場記録の削除（`deleteSessionByAdmin`）

**Files:**
- Modify: `apps/api/src/lib/session-admin.ts`（関数を追加）
- Create: `apps/api/test/session-admin.delete.test.ts`

**Interfaces:**
- Consumes: Task 5 の `sessionNotFound`、Task 6 の `deleteEventIfEmptyPast`
- Produces: `deleteSessionByAdmin(db: Db, sessionId: string, now: Date): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/test/session-admin.delete.test.ts` を作る。

```ts
import { sessions } from '@tecnova/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSessionByAdmin } from '../src/lib/session-admin';
import { eventDates, jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

const TODAY = '2026-10-11';
const PAST = '2026-10-04';
const NOW = jst(TODAY, '15:00');
const db = testDb();

const sessionCount = async () => (await db.select({ id: sessions.id }).from(sessions)).length;

describe('deleteSessionByAdmin', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
    await seedParticipant(db, '26002');
  });

  it('記録を消し、他の記録が残る開催日は残す', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await seedSession(db, { participantId: '26002', date: PAST, inTime: '10:00', outTime: '11:00' });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await sessionCount()).toBe(1);
    expect(await eventDates(db)).toEqual([PAST]);
  });

  it('過去の開催日の最後の 1 件を消すと開催日も消える', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await eventDates(db)).toEqual([]);
  });

  it('今日の開催日は空になっても残す', async () => {
    const id = await seedSession(db, { participantId: '26001', date: TODAY, inTime: '10:00', outTime: '11:00' });
    await deleteSessionByAdmin(db, id, NOW);
    expect(await eventDates(db)).toEqual([TODAY]);
  });

  it('存在しない記録は SESSION_NOT_FOUND', async () => {
    await expect(deleteSessionByAdmin(db, 'no-such-session', NOW)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/api test -- session-admin.delete`
Expected: FAIL（`deleteSessionByAdmin` が export されていない）

- [ ] **Step 3: 実装する**

`apps/api/src/lib/session-admin.ts` の末尾に追加する。

```ts
export const deleteSessionByAdmin = async (db: Db, sessionId: string, now: Date): Promise<void> => {
  const [current] = await db
    .select({ eventId: sessions.eventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!current) throw sessionNotFound();
  await db.batch([
    db.delete(sessions).where(eq(sessions.id, sessionId)),
    deleteEventIfEmptyPast(db, current.eventId, toJstDateString(now)),
  ]);
};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/api test`
Expected: PASS（smoke 2 + create 11 + update 11 + delete 4）

Run: `pnpm --filter @tecnova/api type-check && pnpm biome check apps/api`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add apps/api/src/lib/session-admin.ts apps/api/test/session-admin.delete.test.ts
git commit -m "feat(api): add admin session deletion with empty past event cleanup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: api — ルートとエラー変換

**Files:**
- Modify: `apps/api/src/routes/admin.ts`（import と 3 ルートを追加）
- Modify: `apps/api/src/lib/errors.ts`（`SessionError` のステータス表と分岐）
- Create: `apps/api/test/sessions-routes.test.ts`

**Interfaces:**
- Consumes: Task 3 の `createSessionRequestSchema` / `updateSessionRequestSchema`、Task 5〜7 の `createSessionByAdmin` / `updateSessionByAdmin` / `deleteSessionByAdmin` / `SessionError` / `SessionErrorCode`、既存の `requireAdmin` / `createDb` / `invalidBodyError` / `apiErrorHandler`
- Produces: `POST /api/sessions`（201）・`PATCH /api/sessions/:sessionId`（200）・`DELETE /api/sessions/:sessionId`（204）

- [ ] **Step 1: 失敗するテストを書く**

`apps/api/test/sessions-routes.test.ts` を作る。

```ts
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiErrorHandler } from '../src/lib/errors';
import { adminRoute } from '../src/routes/admin';
import type { AppEnv, Bindings } from '../src/types';
import { jst, resetTables, seedParticipant, seedSession, testDb } from './helpers';

// Better Auth を通さずに mentor を差し込んだアプリ。ルート単位の requireAdmin とエラー変換を確かめる。
const appAs = (role: 'admin' | 'mentor') => {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('user', { id: 'u1', email: 'tester@example.com', name: 'Tester' });
    c.set('mentor', { id: 'm1', email: 'tester@example.com', name: 'Tester', role });
    await next();
  });
  app.route('/api', adminRoute);
  app.onError(apiErrorHandler);
  return app;
};

// ルートは new Date() を現在時刻に使うので、どの実行日でも過去になる日付を使う。
const PAST = '2026-01-15';
const bindings = env as unknown as Bindings;
const db = testDb();

const send = (app: Hono<AppEnv>, method: string, path: string, body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings,
  );

const validBody = {
  participantId: '26001',
  checkedInAt: jst(PAST, '10:00').toISOString(),
  checkedOutAt: jst(PAST, '11:00').toISOString(),
};

describe('/api/sessions の修正ルート', () => {
  beforeEach(async () => {
    await resetTables(db);
    await seedParticipant(db, '26001');
  });

  it('admin 以外は POST / PATCH / DELETE が 403', async () => {
    const app = appAs('mentor');
    expect((await send(app, 'POST', '/api/sessions', validBody)).status).toBe(403);
    expect((await send(app, 'PATCH', '/api/sessions/x', { checkedOutAt: null })).status).toBe(403);
    expect((await send(app, 'DELETE', '/api/sessions/x')).status).toBe(403);
  });

  it('admin 以外でも一覧の GET は使える', async () => {
    const res = await send(appAs('mentor'), 'GET', `/api/sessions?date=${PAST}`);
    expect(res.status).toBe(200);
  });

  it('admin の POST は 201 で eventDate と記録を返す', async () => {
    const res = await send(appAs('admin'), 'POST', '/api/sessions', validBody);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { eventDate: string; session: { participantId: string } };
    expect(body.eventDate).toBe(PAST);
    expect(body.session.participantId).toBe('26001');
  });

  it('本文の形式が違うと 400', async () => {
    const res = await send(appAs('admin'), 'POST', '/api/sessions', { participantId: '1' });
    expect(res.status).toBe(400);
  });

  it('ルール違反はコードと日本語メッセージで返す（重なりは 409）', async () => {
    await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:30', outTime: '12:00' });
    const res = await send(appAs('admin'), 'POST', '/api/sessions', validBody);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'OVERLAP',
      message: '同じ子の同じ日の別の記録と時間が重なっています',
    });
  });

  it('admin の PATCH は 200、DELETE は 204、存在しない記録の DELETE は 404', async () => {
    const id = await seedSession(db, { participantId: '26001', date: PAST, inTime: '10:00', outTime: '11:00' });
    const app = appAs('admin');
    const patched = await send(app, 'PATCH', `/api/sessions/${id}`, {
      checkedOutAt: jst(PAST, '11:30').toISOString(),
    });
    expect(patched.status).toBe(200);
    expect((await send(app, 'DELETE', `/api/sessions/${id}`)).status).toBe(204);
    const missing = await send(app, 'DELETE', `/api/sessions/${id}`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'SESSION_NOT_FOUND' });
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `pnpm --filter @tecnova/api test -- sessions-routes`
Expected: FAIL（POST が 404 を返す・ルール違反が 500 になる）

- [ ] **Step 3: エラー変換を追加する**

`apps/api/src/lib/errors.ts` の import に追加する。

```ts
import { SessionError, type SessionErrorCode } from './session-admin';
```

`checkinErrorStatus` の後に追加する。

```ts
const sessionErrorStatus: Record<SessionErrorCode, ContentfulStatusCode> = {
  SESSION_NOT_FOUND: 404,
  PARTICIPANT_NOT_FOUND: 404,
  CHECKOUT_BEFORE_CHECKIN: 400,
  SPANS_DAYS: 400,
  FUTURE_TIME: 400,
  OPEN_SESSION_NOT_TODAY: 400,
  OVERLAP: 409,
};
```

`apiErrorHandler` の `PreRegistrationError` の分岐の後に追加する。

```ts
  if (e instanceof SessionError) {
    return c.json({ error: e.code, message: e.message }, sessionErrorStatus[e.code]);
  }
```

- [ ] **Step 4: ルートを追加する**

`apps/api/src/routes/admin.ts` の `@tecnova/shared/schemas` の import に `createSessionRequestSchema` と `updateSessionRequestSchema` を加え（アルファベット順を保つ）、lib の import を 1 行追加する。

```ts
import { createSessionByAdmin, deleteSessionByAdmin, updateSessionByAdmin } from '../lib/session-admin';
```

`adminRoute.get('/sessions', …)` の定義の直後に追加する。

```ts
// 来場記録の修正（admin 専用）。受付の操作ミス（チェックイン忘れ・別の子で受付など）を訂正する。
// GET /sessions は全メンター向けのまま残すため、/sessions にサブルーターを mount せず、
// 書き込みのルートにだけ requireAdmin を当てる。
adminRoute.post('/sessions', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  return c.json(await createSessionByAdmin(createDb(c.env), parsed.data, new Date()), 201);
});

adminRoute.patch('/sessions/:sessionId', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(invalidBodyError, 400);
  }
  const sessionId = c.req.param('sessionId');
  return c.json(await updateSessionByAdmin(createDb(c.env), sessionId, parsed.data, new Date()));
});

adminRoute.delete('/sessions/:sessionId', requireAdmin, async (c) => {
  await deleteSessionByAdmin(createDb(c.env), c.req.param('sessionId'), new Date());
  return c.body(null, 204);
});
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm --filter @tecnova/api test`
Expected: PASS（smoke 2 + create 11 + update 11 + delete 4 + routes 6）

Run: `pnpm --filter @tecnova/api type-check && pnpm biome check apps/api`
Expected: エラーなし

- [ ] **Step 6: Workers 制約と個人情報の観点でレビューする**

`workers-constraint-reviewer` subagent に `apps/api/src/lib/session-admin.ts`・`apps/api/src/routes/admin.ts`・`apps/api/src/lib/errors.ts`・`packages/shared/src/session-rules.ts`・`packages/shared/src/venue-schedule.ts` を、`privacy-reviewer` subagent に `packages/shared/src/schemas/admin.ts`・`apps/api/src/lib/session-admin.ts`・`apps/api/test/**` を確認させる。
Expected: 違反なし。指摘があれば直してからコミットする

- [ ] **Step 7: コミットする**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/lib/errors.ts apps/api/test/sessions-routes.test.ts
git commit -m "feat(api): expose admin-only session correction endpoints

Refs #48, #49

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ui — ダイアログ部品を追加する

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`（shadcn CLI が生成）

**Interfaces:**
- Consumes: `packages/ui/components.json`（style `radix-maia`、ui alias `@tecnova/ui/components`）、依存 `radix-ui`
- Produces: `@tecnova/ui/components/dialog` から `Dialog` / `DialogClose` / `DialogContent` / `DialogDescription` / `DialogFooter` / `DialogHeader` / `DialogTitle` / `DialogTrigger`

- [ ] **Step 1: CLI で追加する**

Run: `cd packages/ui && pnpm dlx shadcn@4.21.0 add dialog && cd ../..`
Expected: `packages/ui/src/components/dialog.tsx` が作られる。既存ファイルの上書きを聞かれたら上書きしない（`button.tsx` などは既存を保つ）

生成先が `packages/ui/src/components/dialog.tsx` 以外だった場合は、そこへ移動する。`git status` で `dialog.tsx` 以外に変更が出ていないことを確かめ、出ていれば `git checkout -- <file>` で戻す。

- [ ] **Step 2: export と型を確かめる**

Run: `grep -nE "^export|^  Dialog" packages/ui/src/components/dialog.tsx`
Expected: `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger` が export されている

Run: `pnpm --filter @tecnova/ui type-check && pnpm biome check packages/ui`
Expected: エラーなし（Biome の整形差分は `pnpm biome check --write packages/ui/src/components/dialog.tsx` で直す）

- [ ] **Step 3: コミットする**

```bash
git add packages/ui/src/components/dialog.tsx
git commit -m "feat(ui): add shadcn dialog component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: admin — 記録フォーム・削除確認・行メニュー・子どもの検索

**Files:**
- Create: `apps/admin/src/lib/session-error-message.ts`
- Create: `apps/admin/src/components/participant-picker.tsx`
- Create: `apps/admin/src/components/session-form-dialog.tsx`
- Create: `apps/admin/src/components/session-delete-dialog.tsx`
- Create: `apps/admin/src/components/session-row-actions.tsx`

**Interfaces:**
- Consumes: Task 2 の `SESSION_RULE_MESSAGES` / `validateSessionTimes` / `SessionRuleViolation` / `jstDateTimeToInstant` / `toJstTimeString`、Task 3 の `SessionMutationResponse`、Task 9 の `Dialog*`、既存の `ParticipantsListResponse`・`apiJson` / `apiFetch` / `ApiError` / `apiErrorMessage`・`toastSuccess` / `toastError`・`useApiResource`
- Produces:
  - `interface PickedParticipant { id: string; fullName: string; nickname: string; grade: string }`、`participantLabel(p: PickedParticipant): string`、`ParticipantPicker({ value, onChange, disabled? })`
  - `interface SessionRecord { sessionId: string; participant: PickedParticipant; checkedInAt: string; checkedOutAt: string | null }`
  - `type SessionFormRequest = { mode: 'create'; date: string; participant: PickedParticipant | null } | { mode: 'edit'; record: SessionRecord }`
  - `SessionFormDialog({ request: SessionFormRequest | null, onClose: () => void, onSaved: (r: SessionMutationResponse) => void })`
  - `SessionDeleteDialog({ record: SessionRecord | null, onClose: () => void, onDeleted: () => void })`
  - `SessionRowActions({ label: string, onEdit: () => void, onDelete: () => void })`
  - `sessionErrorMessage(e: unknown): string`

このタスクの部品は Task 11・12 で画面に組み込み、そこで Playwright による実行時の確認をする。このタスクの関門は型チェックと Lint。

- [ ] **Step 1: API のエラーを画面の文言にする関数を書く**

`apps/admin/src/lib/session-error-message.ts` を作る。

```ts
import { SESSION_RULE_MESSAGES, type SessionRuleViolation } from '@tecnova/shared/session-rules';
import { ApiError, apiErrorMessage } from '@tecnova/ui/lib/api-client';

const isRuleViolation = (code: unknown): code is SessionRuleViolation =>
  typeof code === 'string' && Object.hasOwn(SESSION_RULE_MESSAGES, code);

// API の SessionError（{ error: code, message }）を画面の文言にする。ルール違反は画面側の検証と
// 同じ shared の文言にそろえ、それ以外（記録が無い等）は API の message をそのまま使う。
export const sessionErrorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    const code = (e.body as { error?: unknown } | undefined)?.error;
    if (isRuleViolation(code)) return SESSION_RULE_MESSAGES[code];
  }
  return apiErrorMessage(e);
};
```

- [ ] **Step 2: 子どもの検索部品を書く**

`apps/admin/src/components/participant-picker.tsx` を作る。

```tsx
'use client';

import type { ParticipantsListResponse } from '@tecnova/shared/schemas';
import { Button } from '@tecnova/ui/components/button';
import { Input } from '@tecnova/ui/components/input';
import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';
import { useState } from 'react';

export interface PickedParticipant {
  id: string;
  fullName: string;
  nickname: string;
  grade: string;
}

// 一覧・確認ダイアログでも同じ表記にするため export する。メイン識別子はニックネーム。
export const participantLabel = (p: PickedParticipant): string =>
  `${p.nickname}（${p.fullName}）・${p.grade}・${p.id}`;

interface Props {
  value: PickedParticipant | null;
  onChange: (participant: PickedParticipant | null) => void;
  disabled?: boolean;
}

// 来場記録の子を選ぶ。選択済みなら表示＋「変更」（＝別の子への付け替え）、未選択なら検索欄を出す。
// 検索は既存の /api/participants?search=（ID・氏名・ニックネームの部分一致）を使う。
export function ParticipantPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const { state } = useApiResource<ParticipantsListResponse>(
    value === null && trimmed.length > 0
      ? `/api/participants?search=${encodeURIComponent(trimmed)}&limit=8`
      : null,
  );

  if (value !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="min-w-0 truncate text-sm">{participantLabel(value)}</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          onClick={() => {
            setQuery('');
            onChange(null);
          }}
        >
          変更
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ID・氏名・ニックネームで検索"
        aria-label="子どもを検索"
        disabled={disabled}
      />
      {state.kind === 'loading' && <p className="text-xs text-muted-foreground">検索中...</p>}
      {state.kind === 'error' && <p className="text-xs text-destructive">{state.message}</p>}
      {state.kind === 'ok' &&
        (state.data.participants.length === 0 ? (
          <p className="text-xs text-muted-foreground">見つかりません</p>
        ) : (
          <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border">
            {state.data.participants.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() =>
                    onChange({ id: p.id, fullName: p.fullName, nickname: p.nickname, grade: p.grade })
                  }
                >
                  {participantLabel(p)}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: 記録フォームを書く**

`apps/admin/src/components/session-form-dialog.tsx` を作る。

```tsx
'use client';

import type { SessionMutationResponse } from '@tecnova/shared/schemas';
import { SESSION_RULE_MESSAGES, validateSessionTimes } from '@tecnova/shared/session-rules';
import {
  jstDateTimeToInstant,
  toJstDateString,
  toJstTimeString,
} from '@tecnova/shared/venue-schedule';
import { Button } from '@tecnova/ui/components/button';
import { Checkbox } from '@tecnova/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tecnova/ui/components/dialog';
import { Input } from '@tecnova/ui/components/input';
import { Label } from '@tecnova/ui/components/label';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { toastSuccess } from '@tecnova/ui/lib/toast';
import { useState } from 'react';
import { sessionErrorMessage } from '@/lib/session-error-message';
import { type PickedParticipant, ParticipantPicker } from './participant-picker';

// 編集・削除の対象。ダッシュボードの行と利用者詳細の履歴の両方から組み立てる。
export interface SessionRecord {
  sessionId: string;
  participant: PickedParticipant;
  checkedInAt: string; // ISO 8601 (UTC)
  checkedOutAt: string | null;
}

export type SessionFormRequest =
  | { mode: 'create'; date: string; participant: PickedParticipant | null }
  | { mode: 'edit'; record: SessionRecord };

interface Props {
  // null = 閉じている
  request: SessionFormRequest | null;
  onClose: () => void;
  onSaved: (result: SessionMutationResponse) => void;
}

export function SessionFormDialog({ request, onClose, onSaved }: Props) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{request?.mode === 'edit' ? '来場記録を編集' : '来場記録を追加'}</DialogTitle>
          <DialogDescription>時刻は日本時間で入力します。</DialogDescription>
        </DialogHeader>
        {/* 閉じると DialogContent ごとアンマウントされるので、開くたびにフォームの状態が初期化される */}
        {request && <SessionForm request={request} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

interface InitialValues {
  date: string;
  inTime: string;
  outTime: string;
  stillPresent: boolean;
}

const initialValues = (request: SessionFormRequest, today: string): InitialValues => {
  if (request.mode === 'edit') {
    const { checkedInAt, checkedOutAt } = request.record;
    return {
      date: toJstDateString(new Date(checkedInAt)),
      inTime: toJstTimeString(new Date(checkedInAt)),
      outTime: checkedOutAt ? toJstTimeString(new Date(checkedOutAt)) : '',
      stillPresent: checkedOutAt === null,
    };
  }
  // 今日の追加は「今」を入場時刻の初期値にする（チェックイン忘れをその場で直すことが多いため）。
  return {
    date: request.date,
    inTime: request.date === today ? toJstTimeString(new Date()) : '',
    outTime: '',
    stillPresent: false,
  };
};

function SessionForm({
  request,
  onClose,
  onSaved,
}: {
  request: SessionFormRequest;
  onClose: () => void;
  onSaved: (result: SessionMutationResponse) => void;
}) {
  const [today] = useState(() => toJstDateString(new Date()));
  const [initial] = useState(() => initialValues(request, today));
  const [participant, setParticipant] = useState<PickedParticipant | null>(
    request.mode === 'edit' ? request.record.participant : request.participant,
  );
  const [date, setDate] = useState(initial.date);
  const [inTime, setInTime] = useState(initial.inTime);
  const [outTime, setOutTime] = useState(initial.outTime);
  const [stillPresent, setStillPresent] = useState(initial.stillPresent);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isToday = date === today;
  // 「まだ滞在中」は今日の記録だけ（過去日はルール上許されない）。
  const open = isToday && stillPresent;
  const checkedInAt = date && inTime ? jstDateTimeToInstant(date, inTime) : null;
  const checkedOutAt = !open && date && outTime ? jstDateTimeToInstant(date, outTime) : null;
  // 未入力は保存ボタンを押せなくするだけにし、ルール違反だけを文言で知らせる。
  const incomplete =
    participant === null || checkedInAt === null || (!open && checkedOutAt === null);
  const violation =
    !incomplete && checkedInAt !== null
      ? validateSessionTimes({ checkedInAt, checkedOutAt }, new Date())
      : null;

  const save = async () => {
    if (busy || incomplete || violation !== null || participant === null || checkedInAt === null) {
      return;
    }
    setBusy(true);
    setServerError(null);
    const body = {
      participantId: participant.id,
      checkedInAt: checkedInAt.toISOString(),
      checkedOutAt: checkedOutAt ? checkedOutAt.toISOString() : null,
    };
    try {
      const result =
        request.mode === 'edit'
          ? await apiJson<SessionMutationResponse>(
              `/api/sessions/${encodeURIComponent(request.record.sessionId)}`,
              { method: 'PATCH', body },
            )
          : await apiJson<SessionMutationResponse>('/api/sessions', { method: 'POST', body });
      toastSuccess(request.mode === 'edit' ? '来場記録を更新しました' : '来場記録を追加しました');
      onSaved(result);
      onClose();
    } catch (e) {
      setServerError(sessionErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">子ども</span>
        <ParticipantPicker value={participant} onChange={setParticipant} disabled={busy} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-date">日付</Label>
          <Input
            id="session-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-in">入場時刻</Label>
          <Input
            id="session-in"
            type="time"
            value={inTime}
            onChange={(e) => setInTime(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-out">退場時刻</Label>
          <Input
            id="session-out"
            type="time"
            value={open ? '' : outTime}
            onChange={(e) => setOutTime(e.target.value)}
            disabled={busy || open}
          />
        </div>
      </div>
      {isToday ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="session-present"
            checked={stillPresent}
            onCheckedChange={(v) => setStillPresent(v === true)}
            disabled={busy}
          />
          <Label htmlFor="session-present">まだ滞在中（退場時刻なし）</Label>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">過去の日の記録には退場時刻が必要です。</p>
      )}
      {violation && (
        <p role="alert" className="text-sm text-destructive">
          {SESSION_RULE_MESSAGES[violation]}
        </p>
      )}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {isToday && (
        <p className="text-xs text-muted-foreground">
          今日の記録を変えると、受付端末での次の操作（チェックイン／チェックアウト）が変わります。
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={busy}>
            キャンセル
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy || incomplete || violation !== null}>
          {busy ? '保存中...' : '保存'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: 削除の確認ダイアログを書く**

`apps/admin/src/components/session-delete-dialog.tsx` を作る。

```tsx
'use client';

import { toJstDateString, toJstTimeString } from '@tecnova/shared/venue-schedule';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tecnova/ui/components/alert-dialog';
import { ApiError, apiFetch } from '@tecnova/ui/lib/api-client';
import { toastError, toastSuccess } from '@tecnova/ui/lib/toast';
import { useState } from 'react';
import type { SessionRecord } from './session-form-dialog';

// 例: 「26001 たろう（テスト太郎）の 2026-10-04 10:05〜11:40」
const describeRecord = (r: SessionRecord): string => {
  const at = new Date(r.checkedInAt);
  const out = r.checkedOutAt ? toJstTimeString(new Date(r.checkedOutAt)) : '滞在中';
  return `${r.participant.id} ${r.participant.nickname}（${r.participant.fullName}）の ${toJstDateString(at)} ${toJstTimeString(at)}〜${out}`;
};

interface Props {
  // null = 閉じている
  record: SessionRecord | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function SessionDeleteDialog({ record, onClose, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (record === null || busy) return;
    setBusy(true);
    try {
      // 204 を返すので apiJson ではなく apiFetch を使う。
      const r = await apiFetch(`/api/sessions/${encodeURIComponent(record.sessionId)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new ApiError(r.status, body);
      }
      toastSuccess('来場記録を削除しました');
      onDeleted();
      onClose();
    } catch (e) {
      toastError(e, '削除できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={record !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>来場記録を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {record ? `${describeRecord(record)} の記録を削除します。元に戻せません。` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              // 削除が終わるまでダイアログを閉じない（失敗時にもう一度押せるように）。
              e.preventDefault();
              void remove();
            }}
          >
            {busy ? '削除中...' : '削除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: 行の「…」メニューを書く**

`apps/admin/src/components/session-row-actions.tsx` を作る。

```tsx
'use client';

import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tecnova/ui/components/dropdown-menu';

interface Props {
  // スクリーンリーダー向けの対象名（例: ニックネーム）
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}

// 来場記録の行に付ける「…」メニュー。行やカード全体のクリック（利用者詳細を開く）と干渉しないよう、
// トリガーとメニューのクリックは伝播を止める（メニューは portal だが React のイベントは親へ伝わるため）。
// 編集・削除のダイアログは親で持ち、ここでは開く合図だけを出す。modal={false} にして、
// メニューが閉じる前にダイアログが開いても body のポインター操作がロックされたままにならないようにする。
export function SessionRowActions({ label, onEdit, onDelete }: Props) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${label}の記録の操作`}
          onClick={(e) => e.stopPropagation()}
        >
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-32" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}>
          <IconPencil />
          編集
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <IconTrash />
          削除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 6: 型チェックと Lint**

Run: `pnpm --filter admin type-check && pnpm biome check apps/admin`
Expected: エラーなし（整形差分は `pnpm biome check --write apps/admin` で直す）

- [ ] **Step 7: コミットする**

```bash
git add apps/admin/src/lib/session-error-message.ts apps/admin/src/components/participant-picker.tsx apps/admin/src/components/session-form-dialog.tsx apps/admin/src/components/session-delete-dialog.tsx apps/admin/src/components/session-row-actions.tsx
git commit -m "feat(admin): add session record form, delete dialog, and row actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: admin — ダッシュボードに組み込む

**Files:**
- Modify: `apps/admin/src/app/(authed)/page.tsx`
- Modify: `apps/admin/src/components/record-card.tsx`（コメントのみ）
- Modify: `apps/admin/src/components/participant-detail-sheet.tsx`（`onSessionsChanged` prop を受け取れるようにするだけ。中身の実装は Task 12）
- Modify: `.gitignore`（`.playwright-mcp/` を追加）
- Test（コミットしない）: `.playwright-mcp/dashboard-sessions.js`

**Interfaces:**
- Consumes: Task 10 の `SessionFormDialog` / `SessionFormRequest` / `SessionRecord` / `SessionDeleteDialog` / `SessionRowActions`、Task 3 の `SessionMutationResponse`、既存の `useMe`
- Produces: `ParticipantDetailSheet` の新しい任意 prop `onSessionsChanged?: () => void`（Task 12 が中で呼ぶ）

- [ ] **Step 1: Playwright のテストを書き、今は失敗することを確かめる**

`.gitignore` の末尾に追加する。

```
# Playwright MCP の作業ファイル（スクリプト・スクリーンショット）
.playwright-mcp/
```

admin の開発サーバを起動する（別プロセス）。

Run: `pnpm --filter admin dev`（バックグラウンド。`Ready` が出るまで待つ。ポート 3001）

`.playwright-mcp/dashboard-sessions.js` を作る。

```js
async (page) => {
  const BASE = 'http://localhost:3001';
  const API = 'http://localhost:8787';
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  // JST の yesterday 10:05〜11:40 を UTC に（UTC+9 固定）
  const isoAt = (date, hh, mm) =>
    new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh - 9, mm)).toISOString();
  const session = {
    sessionId: 's1', participantId: '26001', fullName: 'テスト太郎', nickname: 'たろう', grade: '小3',
    checkedInAt: isoAt(yesterday, 10, 5), checkedOutAt: isoAt(yesterday, 11, 40),
    isPresent: false, term: 'morning', counted: true,
  };
  const results = {};

  const run = async (role, viewport) => {
    const p = await page.context().newPage();
    await p.setViewportSize(viewport);
    const calls = [];
    const logs = [];
    let postCount = 0;
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    p.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
    await p.route(`${API}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      const headers = {
        'access-control-allow-origin': BASE, 'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'content-type': 'application/json',
      };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push({ method, path: url.pathname, search: url.search, body: req.postData() });
      const json = (status, body) => route.fulfill({ status, headers, body: JSON.stringify(body) });
      if (url.pathname === '/api/me') return json(200, { user: { id: 'u1', email: 'tester@example.com', name: 'Tester' }, mentor: { id: 'm1', email: 'tester@example.com', name: 'Tester', role } });
      if (url.pathname === '/api/sessions' && method === 'GET') return json(200, { event: { id: 'e1', date: today }, sessions: [session], summary: { totalCheckedIn: 1, currentlyPresent: 0, checkedOut: 1 } });
      if (url.pathname === '/api/events') return json(200, { events: [{ id: 'e1', date: today }, { id: 'e0', date: yesterday }] });
      if (url.pathname === '/api/participants') return json(200, { participants: [{ id: '26002', fullName: 'テスト花子', nickname: 'はなこ', grade: '小4', activatedAt: '2026-04-01T00:00:00.000Z', active: true }], pagination: { page: 1, limit: 8, total: 1 } });
      if (url.pathname === '/api/sessions' && method === 'POST') {
        postCount += 1;
        if (postCount === 2) return json(409, { error: 'OVERLAP', message: '重なり（API の文言）' });
        return json(201, { eventDate: today, session: { ...session, sessionId: 's2', participantId: '26002' } });
      }
      if (url.pathname === '/api/sessions/s1' && method === 'PATCH') return json(200, { eventDate: yesterday, session });
      if (url.pathname === '/api/sessions/s1' && method === 'DELETE') return route.fulfill({ status: 204, headers });
      if (url.pathname.startsWith('/checkin/participants/')) return json(404, { error: 'NOT_FOUND', message: 'not mocked' });
      return json(404, { error: 'NOT_FOUND', message: `mock missing ${method} ${url.pathname}` });
    });

    await p.goto(`${BASE}/`);
    await p.getByRole('heading', { name: 'ダッシュボード' }).waitFor({ timeout: 20000 });
    await p.getByText('たろう').first().waitFor({ timeout: 10000 });
    const out = { logs };
    const addButton = p.getByRole('button', { name: '記録を追加' });
    // PC の表とスマホのカードは両方描画され CSS で片方を隠すので、見えている方だけを数える。
    const menu = p.locator('button[aria-label="たろうの記録の操作"]:visible');
    out.addVisible = await addButton.isVisible().catch(() => false);
    out.menuCount = await menu.count();
    if (role !== 'admin') { await p.close(); return out; }

    // 「…」を押しても利用者詳細は開かない（行・カードのクリックに伝播しない）
    await menu.first().click();
    out.sheetOpenedByMenu = calls.some((c) => c.path.startsWith('/checkin/participants/'));
    await p.keyboard.press('Escape');

    // 追加: 検索して子を選び、昨日 09:30〜10:00 で保存 → POST の本文が JST→UTC 変換済み
    await addButton.click();
    await p.getByRole('dialog').waitFor();
    await p.getByLabel('子どもを検索').fill('はな');
    await p.getByRole('button', { name: /はなこ（テスト花子）・小4・26002/ }).click();
    await p.getByLabel('日付').fill(yesterday);
    await p.getByLabel('入場時刻').fill('09:30');
    await p.getByLabel('退場時刻').fill('10:00');
    const getsBefore = calls.filter((c) => c.method === 'GET' && c.path === '/api/sessions').length;
    await p.getByRole('button', { name: '保存' }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    const post = calls.find((c) => c.method === 'POST');
    out.postBody = post ? JSON.parse(post.body) : null;
    out.postOk = out.postBody?.participantId === '26002' && out.postBody?.checkedInAt === isoAt(yesterday, 9, 30) && out.postBody?.checkedOutAt === isoAt(yesterday, 10, 0);
    await p.waitForTimeout(500);
    out.reloadedAfterPost = calls.filter((c) => c.method === 'GET' && c.path === '/api/sessions').length > getsBefore;

    // 画面側の検証: 退場が入場より前ならメッセージが出て保存できない
    await addButton.click();
    await p.getByLabel('子どもを検索').fill('はな');
    await p.getByRole('button', { name: /はなこ/ }).click();
    await p.getByLabel('日付').fill(yesterday);
    await p.getByLabel('入場時刻').fill('11:00');
    await p.getByLabel('退場時刻').fill('10:00');
    out.clientRuleShown = await p.getByText('退場時刻は入場時刻より後にしてください').isVisible();
    out.saveDisabled = await p.getByRole('button', { name: '保存' }).isDisabled();

    // サーバーのルール違反（2 回目の POST は 409 OVERLAP）は shared の文言でダイアログに出る
    await p.getByLabel('退場時刻').fill('11:30');
    await p.getByRole('button', { name: '保存' }).click();
    out.serverRuleShown = await p.getByText('同じ子の同じ日の別の記録と時間が重なっています').waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    await p.keyboard.press('Escape');

    // 編集: 既存の時刻が入って開き、退場を 11:50 にして PATCH → 返った eventDate（昨日）へ表示が切り替わる
    await menu.first().click();
    await p.getByRole('menuitem', { name: '編集' }).click();
    await p.getByRole('dialog').waitFor();
    out.editPrefilled = (await p.getByLabel('入場時刻').inputValue()) === '10:05';
    await p.getByLabel('退場時刻').fill('11:50');
    await p.getByRole('button', { name: '保存' }).click();
    await p.waitForTimeout(800);
    const patch = calls.find((c) => c.method === 'PATCH');
    out.patchOk = patch ? JSON.parse(patch.body).checkedOutAt === isoAt(yesterday, 11, 50) : false;
    out.switchedToEventDate = calls.some((c) => c.method === 'GET' && c.path === '/api/sessions' && c.search === `?date=${yesterday}`);

    // 削除: 確認文に ID と名前が入り、削除で DELETE が飛ぶ
    await menu.first().click();
    await p.getByRole('menuitem', { name: '削除' }).click();
    out.deleteTextOk = await p.getByText(/26001 たろう（テスト太郎）の .* の記録を削除します/).isVisible();
    await p.getByRole('button', { name: '削除' }).click();
    await p.waitForTimeout(800);
    out.deleteCalled = calls.some((c) => c.method === 'DELETE' && c.path === '/api/sessions/s1');

    await p.close();
    return out;
  };

  results.adminDesktop = await run('admin', { width: 1280, height: 900 });
  results.adminMobile = await run('admin', { width: 390, height: 844 });
  results.mentorDesktop = await run('mentor', { width: 1280, height: 900 });
  const a = results.adminDesktop;
  const m = results.adminMobile;
  const n = results.mentorDesktop;
  results.pass = {
    adminSeesControls: a.addVisible && a.menuCount === 1,
    menuDoesNotOpenSheet: a.sheetOpenedByMenu === false && m.sheetOpenedByMenu === false,
    createPostsJstAsUtc: a.postOk && a.reloadedAfterPost,
    clientValidation: a.clientRuleShown && a.saveDisabled,
    serverValidation: a.serverRuleShown,
    editPatchesAndSwitchesDate: a.editPrefilled && a.patchOk && a.switchedToEventDate,
    deleteConfirmsAndDeletes: a.deleteTextOk && a.deleteCalled,
    mobileWorks: m.menuCount === 1 && m.postOk && m.deleteCalled,
    mentorSeesNothing: n.addVisible === false && n.menuCount === 0,
    noConsoleErrors: [a, m, n].every((r) => r.logs.length === 0),
  };
  return results;
}
```

Playwright MCP の `browser_run_code_unsafe` を `filename: ".playwright-mcp/dashboard-sessions.js"` で実行する。
Expected（実装前）: `adminSeesControls` などが `false`（「記録を追加」が無い）

- [ ] **Step 2: ダッシュボードを実装する**

`apps/admin/src/app/(authed)/page.tsx` を次のように変える。

import を追加・変更する。

```tsx
import {
  IconCalendarOff,
  IconLogin2,
  IconLogout2,
  IconPlus,
  IconRefresh,
  IconUserCheck,
} from '@tabler/icons-react';
import type {
  EventsListResponse,
  SessionMutationResponse,
  TodaySessionItem,
  TodaySessionsResponse,
} from '@tecnova/shared/schemas';
```

既存の `import { DataError } …` の後に追加する。

```tsx
import { useMe } from '@tecnova/ui/components/me-provider';
```

`import { useState } from 'react';` を次に変える。

```tsx
import { type ReactNode, useState } from 'react';
```

`@/components/reveal` の import の後に追加する。

```tsx
import { SessionDeleteDialog } from '@/components/session-delete-dialog';
import {
  type SessionFormRequest,
  type SessionRecord,
  SessionFormDialog,
} from '@/components/session-form-dialog';
import { SessionRowActions } from '@/components/session-row-actions';
```

`fmtTime` の定義の後に追加する。

```tsx
// 一覧の行から編集・削除の対象を組み立てる。
const toRecord = (s: TodaySessionItem): SessionRecord => ({
  sessionId: s.sessionId,
  participant: { id: s.participantId, fullName: s.fullName, nickname: s.nickname, grade: s.grade },
  checkedInAt: s.checkedInAt,
  checkedOutAt: s.checkedOutAt,
});
```

`DashboardPage` の中で、`const pastEvents = …;` の後に追加する。

```tsx
  // 来場記録の修正は admin のみ（API も requireAdmin で守っている）。
  const me = useMe();
  const isAdmin = me.mentor.role === 'admin';
  const [formRequest, setFormRequest] = useState<SessionFormRequest | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<SessionRecord | null>(null);

  const refreshAll = () => {
    sessions.reload({ background: true });
    eventsResource.reload({ background: true });
  };
  const handleSaved = (result: SessionMutationResponse) => {
    refreshAll();
    // 記録が別の日付に属する場合（過去日の追加・日付の変更）は、その日付へ表示を切り替える。
    setSelectedDate(result.eventDate === today ? TODAY_VALUE : result.eventDate);
  };
```

`PageHeader` の `actions` の `<Button …>更新</Button>` の後に追加する。

```tsx
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setFormRequest({
                      mode: 'create',
                      date: selectedDate === TODAY_VALUE ? today : selectedDate,
                      participant: null,
                    })
                  }
                >
                  <IconPlus data-icon="inline-start" />
                  記録を追加
                </Button>
              )}
```

`<DashboardBody … />` に prop を追加する。

```tsx
        <DashboardBody
          sessions={sessions.state}
          onSelectParticipant={(id) => setSelectedParticipantId(id)}
          renderActions={
            isAdmin
              ? (s) => (
                  <SessionRowActions
                    label={s.nickname}
                    onEdit={() => setFormRequest({ mode: 'edit', record: toRecord(s) })}
                    onDelete={() => setDeleteRecord(toRecord(s))}
                  />
                )
              : undefined
          }
        />
```

`<ParticipantDetailSheet … />` に `onSessionsChanged={refreshAll}` を追加し、その後（`</main>` の前）にダイアログを追加する。

```tsx
      <SessionFormDialog
        request={formRequest}
        onClose={() => setFormRequest(null)}
        onSaved={handleSaved}
      />
      <SessionDeleteDialog
        record={deleteRecord}
        onClose={() => setDeleteRecord(null)}
        onDeleted={refreshAll}
      />
```

`DashboardBody` の props に `renderActions` を加える。

```tsx
function DashboardBody({
  sessions,
  onSelectParticipant,
  renderActions,
}: {
  sessions: ResourceState<TodaySessionsResponse>;
  onSelectParticipant: (id: string) => void;
  // admin のときだけ渡される行ごとの操作（「…」メニュー）
  renderActions?: (s: TodaySessionItem) => ReactNode;
}) {
```

モバイルのカードで、状態の `<Badge …>…</Badge>` を次に置き換える（カード全面のボタンより前面に出すため `relative z-10`）。

```tsx
                <div className="flex items-center gap-1">
                  <Badge variant={s.isPresent ? 'default' : 'secondary'}>
                    {s.isPresent ? '来場中' : '退出済'}
                  </Badge>
                  {renderActions && <div className="relative z-10">{renderActions(s)}</div>}
                </div>
```

デスクトップの表で、`<TableHead>状態</TableHead>` の後に追加する。

```tsx
              {renderActions && (
                <TableHead className="w-12">
                  <span className="sr-only">操作</span>
                </TableHead>
              )}
```

空表示の `<TableCell colSpan={8}>` を `<TableCell colSpan={renderActions ? 9 : 8}>` に変え、各行の状態セル（`<TableCell><Badge …></TableCell>`）の後に追加する。

```tsx
                  {renderActions && <TableCell className="text-right">{renderActions(s)}</TableCell>}
```

`apps/admin/src/components/record-card.tsx` のコメント「タップ可能カードは内部に他のインタラクティブ要素を持たない前提。」を次に変える。

```tsx
// タップ可能カードは原則として内部にインタラクティブ要素を持たない。置く場合は `relative z-10` で
// 全面ボタンより前に出し、クリックの伝播を止める（例: ダッシュボードの来場記録の「…」メニュー）。
```

`apps/admin/src/components/participant-detail-sheet.tsx` の `Props` に追加する（Task 12 で使う）。

```tsx
interface Props {
  participantId: string | null;
  onOpenChange: (open: boolean) => void;
  // 来場記録を修正したときに親（ダッシュボード）の一覧も再取得させる
  onSessionsChanged?: () => void;
}
```

- [ ] **Step 3: Playwright のテストが通ることを確かめる**

`browser_run_code_unsafe` を `filename: ".playwright-mcp/dashboard-sessions.js"` で再実行する。
Expected: `results.pass` の全項目が `true`

Run: `pnpm --filter admin type-check && pnpm biome check apps/admin`
Expected: エラーなし（import の並び順・整形の差分は `pnpm biome check --write apps/admin` で直す）

- [ ] **Step 4: コミットする**

```bash
git add .gitignore "apps/admin/src/app/(authed)/page.tsx" apps/admin/src/components/record-card.tsx apps/admin/src/components/participant-detail-sheet.tsx
git commit -m "feat(admin): correct check-in records from the dashboard

Refs #48, #49

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: admin — 利用者詳細に組み込む

**Files:**
- Modify: `apps/admin/src/components/participant-detail-sheet.tsx`
- Test（コミットしない）: `.playwright-mcp/detail-sheet-sessions.js`

**Interfaces:**
- Consumes: Task 10 の部品、Task 11 で追加した `onSessionsChanged` prop、既存の `ParticipantProfileResponse` / `useMe` / `toJstDateString`
- Produces: 利用者詳細の「来場履歴」から記録を追加・編集・削除できる画面

- [ ] **Step 1: Playwright のテストを書き、今は失敗することを確かめる**

admin の開発サーバが動いていなければ起動する。Run: `pnpm --filter admin dev`（ポート 3001）

`.playwright-mcp/detail-sheet-sessions.js` を作る。

```js
async (page) => {
  const BASE = 'http://localhost:3001';
  const API = 'http://localhost:8787';
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  const isoAt = (date, hh, mm) =>
    new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh - 9, mm)).toISOString();
  const row = {
    sessionId: 's1', participantId: '26001', fullName: 'テスト太郎', nickname: 'たろう', grade: '小3',
    checkedInAt: isoAt(yesterday, 10, 5), checkedOutAt: isoAt(yesterday, 11, 40),
    isPresent: false, term: 'morning', counted: true,
  };
  const profile = {
    participant: { id: '26001', fullName: 'テスト太郎', nickname: 'たろう', grade: '小3', activatedAt: '2026-04-01T00:00:00.000Z' },
    stats: { visitCount: 1, participationCount: 1, visitDayCount: 1, uncountedVisitCount: 0, lastVisitedAt: row.checkedInAt, totalStayDurationMinutes: 95 },
    current: { isPresent: false, checkedInAt: null, nextAction: 'check_in' },
    sessions: [{ sessionId: 's1', checkedInAt: row.checkedInAt, checkedOutAt: row.checkedOutAt, stayDurationMinutes: 95, term: 'morning', counted: true, isPresent: false }],
  };
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  const calls = [];
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  p.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
  await p.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = {
      'access-control-allow-origin': BASE, 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'content-type': 'application/json',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ method, path: url.pathname, search: url.search, body: req.postData() });
    const json = (status, body) => route.fulfill({ status, headers, body: JSON.stringify(body) });
    if (url.pathname === '/api/me') return json(200, { user: { id: 'u1', email: 'tester@example.com', name: 'Tester' }, mentor: { id: 'm1', email: 'tester@example.com', name: 'Tester', role: 'admin' } });
    if (url.pathname === '/api/sessions' && method === 'GET') return json(200, { event: { id: 'e1', date: today }, sessions: [row], summary: { totalCheckedIn: 1, currentlyPresent: 0, checkedOut: 1 } });
    if (url.pathname === '/api/events') return json(200, { events: [{ id: 'e1', date: today }] });
    if (url.pathname === '/checkin/participants/26001') return json(200, profile);
    if (url.pathname === '/api/sessions' && method === 'POST') return json(201, { eventDate: today, session: { ...row, sessionId: 's2', checkedOutAt: null, isPresent: true } });
    if (url.pathname === '/api/sessions/s1' && method === 'DELETE') return route.fulfill({ status: 204, headers });
    return json(404, { error: 'NOT_FOUND', message: `mock missing ${method} ${url.pathname}` });
  });

  const out = { logs };
  await p.goto(`${BASE}/`);
  await p.getByRole('heading', { name: 'ダッシュボード' }).waitFor({ timeout: 20000 });
  // 行（氏名のセル）をクリックして利用者詳細を開く
  await p.getByRole('cell', { name: 'テスト太郎' }).click();
  const sheet = p.getByRole('dialog').filter({ hasText: '来場履歴' });
  await sheet.waitFor({ timeout: 10000 });
  const sheetAdd = sheet.getByRole('button', { name: '記録を追加' });
  out.sheetAddVisible = await sheetAdd.isVisible().catch(() => false);

  // 追加: その子が選ばれた状態・日付は今日で開く → 「まだ滞在中」で保存
  if (out.sheetAddVisible) {
    await sheetAdd.click();
    const form = p.getByRole('dialog').filter({ hasText: '来場記録を追加' });
    await form.waitFor();
    out.participantPrefilled = await form.getByText('たろう（テスト太郎）・小3・26001').isVisible();
    out.datePrefilled = (await form.getByLabel('日付').inputValue()) === today;
    await form.getByLabel('まだ滞在中（退場時刻なし）').click();
    const profileGetsBefore = calls.filter((c) => c.path === '/checkin/participants/26001').length;
    const listGetsBefore = calls.filter((c) => c.method === 'GET' && c.path === '/api/sessions').length;
    await form.getByRole('button', { name: '保存' }).click();
    await p.waitForTimeout(800);
    const post = calls.find((c) => c.method === 'POST');
    const body = post ? JSON.parse(post.body) : null;
    out.postOk = body?.participantId === '26001' && body?.checkedOutAt === null;
    out.sheetReloaded = calls.filter((c) => c.path === '/checkin/participants/26001').length > profileGetsBefore;
    out.listReloaded = calls.filter((c) => c.method === 'GET' && c.path === '/api/sessions').length > listGetsBefore;
  }

  // 削除: 履歴の行の「…」から削除
  const menu = sheet.getByRole('button', { name: 'たろうの記録の操作' });
  out.sheetMenuVisible = await menu.isVisible().catch(() => false);
  if (out.sheetMenuVisible) {
    await menu.click();
    await p.getByRole('menuitem', { name: '削除' }).click();
    await p.getByRole('button', { name: '削除' }).click();
    await p.waitForTimeout(800);
    out.deleteCalled = calls.some((c) => c.method === 'DELETE' && c.path === '/api/sessions/s1');
  }
  await p.close();

  out.pass = {
    addFromSheet: out.sheetAddVisible && out.participantPrefilled && out.datePrefilled && out.postOk,
    reloadsSheetAndList: out.sheetReloaded && out.listReloaded,
    deleteFromSheet: out.sheetMenuVisible && out.deleteCalled,
    noConsoleErrors: logs.length === 0,
  };
  return out;
}
```

`browser_run_code_unsafe` を `filename: ".playwright-mcp/detail-sheet-sessions.js"` で実行する。
Expected（実装前）: `addFromSheet` が `false`（「記録を追加」が無い）

- [ ] **Step 2: 利用者詳細を実装する**

`apps/admin/src/components/participant-detail-sheet.tsx` を次のように変える。

import を追加する。

```tsx
import { IconPlus } from '@tabler/icons-react';
import { toJstDateString } from '@tecnova/shared/venue-schedule';
import { Button } from '@tecnova/ui/components/button';
import { useMe } from '@tecnova/ui/components/me-provider';
import { useState } from 'react';
import type { PickedParticipant } from './participant-picker';
import { SessionDeleteDialog } from './session-delete-dialog';
import {
  type SessionFormRequest,
  type SessionRecord,
  SessionFormDialog,
} from './session-form-dialog';
import { SessionRowActions } from './session-row-actions';
```

`ParticipantDetailSheet` の先頭（関数のシグネチャから `useApiResource` の呼び出しまで）を置き換える。

置き換え前:

```tsx
export function ParticipantDetailSheet({ participantId, onOpenChange }: Props) {
  const open = participantId !== null;
  // 開いているあいだだけ取得する（閉じている＝path=null で idle）。
  const { state } = useApiResource<ParticipantProfileResponse>(
    participantId ? `/checkin/participants/${encodeURIComponent(participantId)}` : null,
  );
```

置き換え後:

```tsx
export function ParticipantDetailSheet({ participantId, onOpenChange, onSessionsChanged }: Props) {
  const open = participantId !== null;
  // 開いているあいだだけ取得する（閉じている＝path=null で idle）。
  const { state, reload } = useApiResource<ParticipantProfileResponse>(
    participantId ? `/checkin/participants/${encodeURIComponent(participantId)}` : null,
  );
  // 来場記録の修正は admin のみ（API も requireAdmin で守っている）。
  const me = useMe();
  const isAdmin = me.mentor.role === 'admin';
  const [formRequest, setFormRequest] = useState<SessionFormRequest | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<SessionRecord | null>(null);

  // 参加回数などの集計は参照時に計算されるので、詳細を取り直せば修正が反映される。
  const handleChanged = () => {
    reload({ background: true });
    onSessionsChanged?.();
  };
```

同じ関数の `return (` 直後の `<Sheet open={open} onOpenChange={onOpenChange}>` を次の 2 行に置き換える。

```tsx
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
```

同じ関数の末尾の `    </Sheet>` を次に置き換える（その後の `  );` と `}` はそのまま）。

```tsx
      </Sheet>
      <SessionFormDialog
        request={formRequest}
        onClose={() => setFormRequest(null)}
        onSaved={handleChanged}
      />
      <SessionDeleteDialog
        record={deleteRecord}
        onClose={() => setDeleteRecord(null)}
        onDeleted={handleChanged}
      />
    </>
```

`<Sheet>` の中のインデントは後で `pnpm biome check --write apps/admin/src/components/participant-detail-sheet.tsx` で整える。

`<SheetContent>` の中の `{state.kind === 'ok' && <DetailBody data={state.data} />}` を次に置き換える。

```tsx
          {state.kind === 'ok' && (
            <DetailBody
              data={state.data}
              isAdmin={isAdmin}
              onAdd={(participant) =>
                setFormRequest({ mode: 'create', date: toJstDateString(new Date()), participant })
              }
              onEdit={(record) => setFormRequest({ mode: 'edit', record })}
              onDelete={(record) => setDeleteRecord(record)}
            />
          )}
```

`DetailBody` のシグネチャを変える。

```tsx
function DetailBody({
  data,
  isAdmin,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: ParticipantProfileResponse;
  isAdmin: boolean;
  onAdd: (participant: PickedParticipant) => void;
  onEdit: (record: SessionRecord) => void;
  onDelete: (record: SessionRecord) => void;
}) {
  const { participant, stats, current, sessions } = data;
  const picked: PickedParticipant = {
    id: participant.id,
    fullName: participant.fullName,
    nickname: participant.nickname,
    grade: participant.grade,
  };
  const toRecord = (s: ParticipantProfileResponse['sessions'][number]): SessionRecord => ({
    sessionId: s.sessionId,
    participant: picked,
    checkedInAt: s.checkedInAt,
    checkedOutAt: s.checkedOutAt,
  });
```

「来場履歴」の見出し `<h3 className="text-sm font-semibold">来場履歴</h3>` を次に置き換える。

```tsx
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">来場履歴</h3>
          {isAdmin && (
            <Button type="button" variant="outline" size="xs" onClick={() => onAdd(picked)}>
              <IconPlus data-icon="inline-start" />
              記録を追加
            </Button>
          )}
        </div>
```

履歴テーブルの見出し行を、admin のときは操作列を足した幅にする。

```tsx
                <TableRow>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[34%]' : 'w-[38%]'}`}>入室</TableHead>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[34%]' : 'w-[38%]'}`}>退室</TableHead>
                  <TableHead className={`h-9 px-1.5 ${isAdmin ? 'w-[20%]' : 'w-[24%]'}`}>滞在</TableHead>
                  {isAdmin && (
                    <TableHead className="h-9 w-[12%] px-1">
                      <span className="sr-only">操作</span>
                    </TableHead>
                  )}
                </TableRow>
```

各行の滞在セル（`fmtMinutes(s.stayDurationMinutes)` のセル）の後に追加する。

```tsx
                    {isAdmin && (
                      <TableCell className="px-1 py-1 text-right">
                        <SessionRowActions
                          label={participant.nickname}
                          onEdit={() => onEdit(toRecord(s))}
                          onDelete={() => onDelete(toRecord(s))}
                        />
                      </TableCell>
                    )}
```

- [ ] **Step 3: Playwright のテストが通ることを確かめる**

`browser_run_code_unsafe` を `filename: ".playwright-mcp/detail-sheet-sessions.js"` で再実行する。
Expected: `out.pass` の全項目が `true`

ダッシュボードのテストも再実行して壊れていないことを確かめる（`filename: ".playwright-mcp/dashboard-sessions.js"`）。
Expected: `results.pass` の全項目が `true`

Run: `pnpm --filter admin type-check && pnpm biome check apps/admin`
Expected: エラーなし（import の並び順・整形の差分は `pnpm biome check --write apps/admin` で直す）

- [ ] **Step 4: コミットする**

```bash
git add apps/admin/src/components/participant-detail-sheet.tsx
git commit -m "feat(admin): correct check-in records from the participant detail sheet

Refs #48, #49

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 仕上げ — ドキュメント・PR 前チェック・最終確認

**Files:**
- Modify: `docs/requirements.md`（§3.2）
- Modify: `docs/handoff.md`（完了済み表・直近の優先事項・作業の進め方）
- Modify: `.claude/skills/pre-pr-check/SKILL.md`（API テストを追加）
- Modify: `CLAUDE.md`（よく使うコマンドに API テスト）

**Interfaces:**
- Consumes: Task 1〜12 の成果物
- Produces: develop 向けの PR

- [ ] **Step 1: requirements.md を実装済みにする**

`docs/requirements.md` §3.2 の次の行を置き換える。

置き換え前:

````markdown
- **チェックイン記録の修正（直近の優先事項）**: チェックイン忘れ・押し間違いといった操作ミスが頻発しているため、管理画面から来場記録を追加・編集・削除できるようにする（admin のみ。Issue #48 / #49）
````

置き換え後:

````markdown
- **チェックイン記録の修正（2026-10 実装済み）**: チェックイン忘れ・押し間違いといった操作ミスが頻発しているため、管理画面（ダッシュボード・利用者詳細）から来場記録を追加・編集・削除できるようにした（admin のみ。Issue #48 / #49。仕様は `mvp.md` §6.2「来場記録の修正」）
````

- [ ] **Step 2: handoff.md を更新する**

`docs/handoff.md` の「完了済み」表の最後の行（`| checkin 参加ガイドラインの文言・レイアウト刷新…`）の後に追加する。

````markdown
| 来場記録の修正（admin のみ。ダッシュボード・利用者詳細から追加・編集・削除）+ API の自動テスト基盤 | このブランチの PR（Issue #48 / #49） |
````

「### 直近の優先事項（2026-10 時点）」の「**1. チェックイン記録の修正機能（Issue #48 / #49）**」から、その箇条書きの最後（「get-or-create が要る」の行）までを削除し、続く「**2. QR 読み取り精度の改善（バグ）**」を「**1. QR 読み取り精度の改善（バグ）**」に変える。

「## 作業の進め方」の箇条書きの最後に追加する。

````markdown
- **API のテスト**：`pnpm --filter @tecnova/api test`（`@cloudflare/vitest-plugin`。ローカルの D1 にマイグレーションを当てて `apps/api/src/lib` を直接テストする。各テストの前に `resetTables` で空にする）。`packages/shared` は `pnpm --filter @tecnova/shared test`。どちらも CI では走らないので PR 前に手元で実行する
````

- [ ] **Step 3: pre-pr-check と CLAUDE.md に API テストを足す**

`.claude/skills/pre-pr-check/SKILL.md` のチェックリスト 3 を置き換える。

````markdown
3. **テスト（CI は実行しない・該当パッケージを触ったら必須）**:
   ```bash
   pnpm --filter @tecnova/shared test
   pnpm --filter @tecnova/api test
   ```
````

`CLAUDE.md` の「よく使うコマンド」の `pnpm type-check` のブロックの後に追加する。

````markdown
# テスト（CI では走らない。PR 前に手元で実行）
pnpm --filter @tecnova/shared test
pnpm --filter @tecnova/api test
````

（`CLAUDE.md` のコマンドは 1 つの ```bash ブロックにまとまっているので、その中の `# 型チェック` の 2 行の直後に上の 3 行を入れる）

- [ ] **Step 4: すべての確認を通す**

Run: `pnpm lint && pnpm type-check && pnpm --filter @tecnova/shared test && pnpm --filter @tecnova/api test && .claude/skills/pre-pr-check/scripts/scan-secrets.sh`
Expected: すべて成功。テストの失敗 0、シークレット検出なし

Playwright の 2 本（`.playwright-mcp/dashboard-sessions.js` と `.playwright-mcp/detail-sheet-sessions.js`）を再実行する。
Expected: 全項目 `true`

`git status --short` で `.playwright-mcp/` が出ていないこと（`.gitignore` 済み）を確かめる。admin の開発サーバを止める。

- [ ] **Step 5: ブランチ全体をレビューする**

`superpowers:requesting-code-review` に従い、`fix/checkin-qr-on-demand-scan..HEAD` の差分をレビューに出す。指摘は `superpowers:receiving-code-review` に従って検証してから直す。

- [ ] **Step 6: コミットして PR を出す**

```bash
git add docs/requirements.md docs/handoff.md .claude/skills/pre-pr-check/SKILL.md CLAUDE.md
git commit -m "docs: record check-in correction as shipped and add API test command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/admin-session-correction
```

`gh pr create --base develop` で PR を出す。本文の冒頭に「#50 → #51 の順にマージしてからマージする（`docs/handoff.md`・`docs/mvp.md` を共有しているため #51 の上に積んでいる）」と書き、変更内容・テスト結果（shared / api の件数、Playwright の確認項目）・未確認事項（本番の D1 での動作は本番反映後に確認）を載せ、`Closes #48`・`Closes #49` と末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)` を付ける。
