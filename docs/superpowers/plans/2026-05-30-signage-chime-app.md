# サイネージ＋チャイム アプリ 実装計画（YouTube 版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **改訂 2026-05-30:** 設計 spec の YouTube 改訂（動画レイヤを self-host HTML5 `<video>` → **YouTube IFrame Player API 自前キュー ＋ YouTube Data API**、BGM を **OS側 Spotify**＝アプリ非統合）に合わせて本計画を更新した。チャイム・50/10サイクル・状態機械・認証・`/api/sessions/today` ポーリングは不変。差分は (1) `packages/shared` に `youtube.ts`／`schemas/signage.ts` を追加、(2) `apps/api` に `GET /api/signage/playlist` を新設（旧版は「設定のみ」だった）、(3) フロントの動画レイヤを YouTube プレーヤー＋自前キュー＋無音トグルに置換。

**Goal:** 大型モニター常時表示用の認証付きサイネージアプリ `apps/signage` を新設し、50分活動／10分休憩サイクルに連動した **YouTube動画表示**・カウントダウン・チャイムを自動制御する。

**Architecture:** 端末ローカル時計から純粋ロジック（`@tecnova/shared/activity-cycle`）で活動/休憩フェーズとチャイム時刻を算出し、稼働判定は認証付き既存 `GET /api/sessions/today` のターム別チェックイン数（初回チェックインで稼働開始・ターム終了まで sticky）で行う。動画は **YouTube IFrame Player API の自前キュー**（`ENDED`/`onError` で次の videoId へ `loadVideoById`）で1本ずつ流し、再生順は YouTube 上のプレイリストを Worker の `GET /api/signage/playlist`（YouTube Data API v3・APIキー・サーバ側キャッシュ）が順序付き videoId 列にして返す。音声は **無音／音ありのグローバルトグル（既定=無音）** のみ持ち、BGMは OS側 Spotify（アプリ非制御）。画面は L2（動画フルスクリーン＋情報バー）で、フェーズ境界にクロスフェードし Web Audio 合成チャイムを鳴らす。認証は checkin/admin と同じメンター・ホワイトリスト（共有管理アカウントで1回ログイン）。

**Tech Stack:** Next.js 16.2.4 / React 19.2.4 / TypeScript / Tailwind v4（`@tecnova/ui`）/ Better Auth（`better-auth/react`）/ motion / Web Audio API / Screen Wake Lock API / **YouTube IFrame Player API（`@types/youtube` のみ devDep 追加・再生用 npm 依存なし）** / **YouTube Data API v3（Worker から APIキー＋plain fetch）** / vitest（`packages/shared` のみ新規導入）。BGMは OS側 Spotify（アプリ非統合）。

設計の根拠は `docs/superpowers/specs/2026-05-29-signage-chime-design.md`（2026-05-30 YouTube 改訂版）を参照。

---

## File Structure

**packages/shared（共有純粋ロジック＋契約）**
- `src/activity-cycle.ts`（新規）— 50/10サイクル分類・チャイムイベント列・カウントダウン
- `src/activity-cycle.test.ts`（新規）— 上記の単体テスト（vitest）
- `src/youtube.ts`（新規）— YouTube Data API `playlistItems.list` の fetch ラッパ（APIキーのみ・ページング・`privacyStatus` フィルタ・`position` 昇順ソート。Workers安全）
- `src/schemas/signage.ts`（新規）— `signagePlaylistItemSchema` / `signagePlaylistResponseSchema` ＋ `z.infer` 型
- `src/schemas/index.ts`（変更）— `export * from './signage'` を追加
- `package.json`（変更）— `exports` に `"./activity-cycle"` と `"./youtube"` を追加 ＋ vitest devDep ＋ `test` スクリプト

**apps/api（コードあり）**
- `src/routes/signage.ts`（新規）— `GET /api/signage/playlist`（`requireAuthenticatedMentor` 配下）
- `src/lib/signage.ts`（新規）— `fetchSignagePlaylist(env)`（`youtube.ts` を呼び・数分の module-scope キャッシュ）
- `src/index.ts`（変更）— `app.route('/api/signage', signageRoute)` を追加
- `src/types.ts`（変更）— `Bindings` に `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` を追加
- `.dev.vars`（変更・git管理外）— `TRUSTED_ORIGINS` にサイネージ origin、`YOUTUBE_API_KEY`、`YOUTUBE_PLAYLIST_ID` を追加
- `.env.example`（変更）— `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID`（名前のみ）と `TRUSTED_ORIGINS` 例を更新

**apps/signage（新規アプリ）**
- 設定: `package.json`（`@types/youtube` devDep・`@zxing` なし）/ `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- 認証: `src/lib/auth-client.ts` / `src/components/app-shell.tsx` / `src/app/login/page.tsx`
- ルート: `src/app/layout.tsx` / `src/app/manifest.ts` / `src/app/page.tsx`（状態機械）
- ロジック: `src/lib/now.ts` / `src/lib/use-now.ts` / `src/lib/time.ts` / `src/lib/use-wake-lock.ts` / `src/lib/chimes.ts` / `src/lib/use-chime-scheduler.ts` / `src/lib/use-signage-data.ts` / `src/lib/use-playlist.ts` / `src/lib/use-youtube-player.ts` / `src/lib/use-mute.ts`
- 設定値: `src/config/playlist.ts`（`FALLBACK_VIDEO_IDS: string[]`）
- 表示: `src/components/{youtube-player,info-bar,break-screen,idle-screen,tap-to-start,mute-toggle}.tsx`
- ドキュメント: `CLAUDE.md` / `AGENTS.md`

**docs**
- `docs/architecture.md`（変更）— クライアント一覧に `apps/signage`（認証あり）を追記

各ファイルは単一責務。`now.ts`（時刻ソース）・`chimes.ts`（音）・`use-chime-scheduler.ts`（発火）・`use-signage-data.ts`（データ）・`use-playlist.ts`（プレイリスト取得）・`use-youtube-player.ts`（IFrame ライフサイクル＋自前キュー）・各表示コンポーネントは独立して理解・差し替え可能。

---

## Task 1: 共有ロジック `activity-cycle.ts`（TDD・vitest 最小導入）

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/src/activity-cycle.test.ts`
- Create: `packages/shared/src/activity-cycle.ts`

- [ ] **Step 1: vitest を devDep と test スクリプトに追加**

`packages/shared/package.json` の `scripts` に `"test": "vitest run"`、`devDependencies` に `"vitest": "^3.2.4"` を追加（他キーは既存のまま）。そして `exports` に `"./activity-cycle"` を追加（`"./venue-schedule"` の隣）：

```json
  "exports": {
    ".": "./src/index.ts",
    "./google-sheets": "./src/google-sheets.ts",
    "./schemas": "./src/schemas/index.ts",
    "./venue-schedule": "./src/venue-schedule.ts",
    "./activity-cycle": "./src/activity-cycle.ts",
    "./youtube": "./src/youtube.ts"
  },
```

（`"./youtube"` は Task 2 で使うが、exports は一度に足しておく。）

- [ ] **Step 2: 依存をインストール** — Run: `pnpm install`（vitest が `packages/shared` に追加され lockfile 更新）。

- [ ] **Step 3: 失敗するテストを書く**

Create `packages/shared/src/activity-cycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  classifyCycleMoment,
  cycleChimeEventsForDay,
  msUntilNextBoundary,
} from './activity-cycle';

// JST 指定の instant を作るヘルパ（Asia/Tokyo は固定 UTC+9）。
const jst = (iso: string): Date => new Date(`${iso}+09:00`);

describe('classifyCycleMoment', () => {
  it('活動中（朝・サイクル1）', () => {
    const m = classifyCycleMoment(jst('2026-05-30T09:30:00'));
    expect(m.phase).toBe('activity');
    expect(m.term).toBe('morning');
    expect(m.cycleIndex).toBe(1);
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T09:50:00').toISOString());
  });

  it(':50 ちょうどは休憩', () => {
    const m = classifyCycleMoment(jst('2026-05-30T09:50:00'));
    expect(m.phase).toBe('break');
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T10:00:00').toISOString());
  });

  it('サイクル3の活動（朝 11:30）', () => {
    const m = classifyCycleMoment(jst('2026-05-30T11:30:00'));
    expect(m.phase).toBe('activity');
    expect(m.cycleIndex).toBe(3);
    expect(m.phaseEndsAt?.toISOString()).toBe(jst('2026-05-30T11:50:00').toISOString());
  });

  it('昼休みは idle', () => {
    const m = classifyCycleMoment(jst('2026-05-30T12:30:00'));
    expect(m.phase).toBe('idle');
    expect(m.term).toBeNull();
    expect(m.phaseEndsAt).toBeNull();
  });

  it('開始前は idle', () => {
    expect(classifyCycleMoment(jst('2026-05-30T08:00:00')).phase).toBe('idle');
  });

  it('夕方ターム内', () => {
    expect(classifyCycleMoment(jst('2026-05-30T16:30:00')).term).toBe('evening');
  });
});

describe('cycleChimeEventsForDay', () => {
  it('1日分は 3ターム×7 = 21 イベント', () => {
    expect(cycleChimeEventsForDay(jst('2026-05-30T09:00:00'))).toHaveLength(21);
  });

  it('時系列順に並ぶ', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00'));
    const ts = ev.map((e) => e.at.getTime());
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it('朝タームの最初の3イベントは resume@9:00 / break@9:50 / resume@10:00', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00')).filter((e) => e.term === 'morning');
    expect(ev[0]).toMatchObject({ kind: 'resume', at: jst('2026-05-30T09:00:00') });
    expect(ev[1]).toMatchObject({ kind: 'break', at: jst('2026-05-30T09:50:00') });
    expect(ev[2]).toMatchObject({ kind: 'resume', at: jst('2026-05-30T10:00:00') });
    expect(ev.at(-1)).toMatchObject({ kind: 'term-end', at: jst('2026-05-30T12:00:00') });
  });

  it('key は安定（日付#term#kind#HH:mm）', () => {
    const ev = cycleChimeEventsForDay(jst('2026-05-30T09:00:00')).find((e) => e.term === 'morning' && e.kind === 'break');
    expect(ev?.key).toBe('2026-05-30#morning#break#09:50');
  });
});

describe('msUntilNextBoundary', () => {
  it('09:30 の次境界は 09:50（20分後）', () => {
    expect(msUntilNextBoundary(jst('2026-05-30T09:30:00'))).toBe(20 * 60 * 1000);
  });

  it('営業終了後は null', () => {
    expect(msUntilNextBoundary(jst('2026-05-30T20:00:00'))).toBeNull();
  });
});
```

- [ ] **Step 4: テストが失敗することを確認** — Run: `pnpm --filter @tecnova/shared test`（`activity-cycle.ts` 不在で import 解決エラー）。

- [ ] **Step 5: 実装を書く**

Create `packages/shared/src/activity-cycle.ts`:

```ts
// 活動50分・休憩10分のリズムを壁時計の「時」に合わせて刻む純粋ロジック。
// 各タームを 50+10=60分 × 3サイクルに割る（3時間タームをちょうど割り切る）。
// venue-schedule と同じく Workers 安全（Intl のみ・Node API なし）、JST 固定 UTC+9。
import { TERMS, type TermId, toJstDateString, toJstWallClock } from './venue-schedule';

export const ACTIVITY_MINUTES = 50;
export const BREAK_MINUTES = 10;
const CYCLE_MINUTES = ACTIVITY_MINUTES + BREAK_MINUTES; // 60

// Asia/Tokyo は DST が無く固定 UTC+9（venue-schedule と同前提）。
const JST_OFFSET_HOURS = 9;

// 'HH:mm' を 0:00 からの通算分に。venue-schedule の同名ヘルパは非公開のため再宣言。
const toMinutesOfDay = (hhmm: string): number =>
  Number.parseInt(hhmm.slice(0, 2), 10) * 60 + Number.parseInt(hhmm.slice(3, 5), 10);

const jstMinuteOfDay = (instant: Date): number => {
  const { hour, minute } = toJstWallClock(instant);
  return hour * 60 + minute;
};

// ref の JST 暦日における JST 通算分 minuteOfDay を UTC instant に変換（termEndInstant と同手法）。
const jstInstantOnDayOf = (ref: Date, minuteOfDay: number): Date => {
  const { year, month, day } = toJstWallClock(ref);
  const hh = Math.floor(minuteOfDay / 60);
  const mm = minuteOfDay % 60;
  return new Date(Date.UTC(year, month - 1, day, hh - JST_OFFSET_HOURS, mm, 0, 0));
};

export type CyclePhase = 'activity' | 'break' | 'idle';

export interface CycleMoment {
  phase: CyclePhase;
  term: TermId | null;
  cycleIndex: number | null; // 1..3、idle のとき null
  phaseEndsAt: Date | null; // 現フェーズ終端（次の境界）、idle のとき null
}

export type ChimeKind = 'resume' | 'break' | 'term-end';

export interface ChimeEvent {
  kind: ChimeKind;
  term: TermId;
  at: Date;
  key: string; // dedup 用安定キー `${date}#${term}#${kind}#${HH:mm}`
}

// 瞬間を活動/休憩/idle に分類し、現フェーズの終端 instant も返す。
export const classifyCycleMoment = (instant: Date): CycleMoment => {
  const current = jstMinuteOfDay(instant);
  for (const term of TERMS) {
    const start = toMinutesOfDay(term.start);
    const end = toMinutesOfDay(term.end);
    if (current >= start && current < end) {
      const offset = current - start; // 0..179
      const cycleIndex = Math.floor(offset / CYCLE_MINUTES) + 1;
      const withinCycle = offset % CYCLE_MINUTES;
      const phase: CyclePhase = withinCycle < ACTIVITY_MINUTES ? 'activity' : 'break';
      const cycleStart = start + (cycleIndex - 1) * CYCLE_MINUTES;
      const boundaryMinute =
        phase === 'activity' ? cycleStart + ACTIVITY_MINUTES : cycleStart + CYCLE_MINUTES;
      return {
        phase,
        term: term.id,
        cycleIndex,
        phaseEndsAt: jstInstantOnDayOf(instant, boundaryMinute),
      };
    }
  }
  return { phase: 'idle', term: null, cycleIndex: null, phaseEndsAt: null };
};

// instant の JST 暦日における全タームのチャイムイベントを時系列順で返す。
// クライアントは tick ごとに「前回 < at <= 今」で境界跨ぎを検出し key で dedup する。
export const cycleChimeEventsForDay = (instant: Date): ChimeEvent[] => {
  const date = toJstDateString(instant);
  const events: ChimeEvent[] = [];
  const push = (kind: ChimeKind, term: TermId, minuteOfDay: number): void => {
    const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
    const mm = String(minuteOfDay % 60).padStart(2, '0');
    events.push({
      kind,
      term,
      at: jstInstantOnDayOf(instant, minuteOfDay),
      key: `${date}#${term}#${kind}#${hh}:${mm}`,
    });
  };
  for (const term of TERMS) {
    const start = toMinutesOfDay(term.start);
    const end = toMinutesOfDay(term.end);
    const cycles = Math.round((end - start) / CYCLE_MINUTES);
    for (let n = 0; n < cycles; n += 1) {
      push('resume', term.id, start + n * CYCLE_MINUTES);
      push('break', term.id, start + n * CYCLE_MINUTES + ACTIVITY_MINUTES);
    }
    push('term-end', term.id, end);
  }
  return events;
};

// 次の境界までのミリ秒。その日もう境界が無ければ null。
export const msUntilNextBoundary = (instant: Date): number | null => {
  const now = instant.getTime();
  const future = cycleChimeEventsForDay(instant)
    .map((e) => e.at.getTime())
    .filter((t) => t > now)
    .sort((a, b) => a - b);
  const next = future[0];
  return next === undefined ? null : next - now;
};

// 秒丸め（ceil で 0 秒の一瞬を避ける）。
export const secondsUntilNextBoundary = (instant: Date): number | null => {
  const ms = msUntilNextBoundary(instant);
  return ms === null ? null : Math.ceil(ms / 1000);
};
```

- [ ] **Step 6: テストが通ることを確認** — Run: `pnpm --filter @tecnova/shared test`（全ケース green）。
- [ ] **Step 7: 型チェック** — Run: `pnpm --filter @tecnova/shared type-check`。
- [ ] **Step 8: コミット**

```bash
git add packages/shared/package.json packages/shared/src/activity-cycle.ts packages/shared/src/activity-cycle.test.ts pnpm-lock.yaml
git commit -m "feat(shared): add activity-cycle (50/10 schedule + chime events)"
```

---

## Task 2: 共有 YouTube 契約 `youtube.ts` ＋ `schemas/signage.ts`

**Files:**
- Create: `packages/shared/src/youtube.ts`
- Create: `packages/shared/src/schemas/signage.ts`
- Modify: `packages/shared/src/schemas/index.ts`

（`package.json` の `"./youtube"` export は Task 1 Step 1 で追加済み。）

- [ ] **Step 1: `youtube.ts`（Data API `playlistItems.list` ラッパ・Workers安全）**

Create `packages/shared/src/youtube.ts`:

```ts
// YouTube Data API v3 playlistItems.list の薄いフェッチラッパ。
// googleapis は Node 依存で Workers 非対応のため使わず、API キー + fetch 直叩き。
// google-sheets.ts の「サーバ側 fetch + 資格情報は引数で受け取る」流儀に倣うが、
// OAuth/JWT は不要（APIキーのみ）。順序は snippet.position 昇順、再生不能動画は除外する。

export interface YouTubePlaylistVideo {
  videoId: string;
  title?: string;
}

interface PlaylistItem {
  snippet?: {
    position?: number;
    title?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
  status?: { privacyStatus?: string };
}

interface PlaylistItemsResponse {
  items?: PlaylistItem[];
  nextPageToken?: string;
}

// public / unlisted のみ埋め込み再生可能。private・未指定・削除済み(videoId欠落)は除外。
const PLAYABLE_PRIVACY = new Set(['public', 'unlisted']);

// playlistId の全ページを取得し、再生可能・position 昇順の videoId 列を返す。
// part に複数指定してもクォータは 1 呼び出し 1 ユニットのまま（spec §5.1）。
export const fetchPlaylistVideos = async (
  apiKey: string,
  playlistId: string,
): Promise<YouTubePlaylistVideo[]> => {
  const collected: { position: number; video: YouTubePlaylistVideo }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`YouTube playlistItems fetch failed: ${resp.status} ${body}`);
    }
    const data = (await resp.json()) as PlaylistItemsResponse;

    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      const privacy = item.status?.privacyStatus;
      if (!videoId || !privacy || !PLAYABLE_PRIVACY.has(privacy)) continue;
      collected.push({
        // position 欠落時は末尾送り。元の取得順ではなく position を正とする。
        position: item.snippet?.position ?? Number.MAX_SAFE_INTEGER,
        video: { videoId, title: item.snippet?.title },
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  collected.sort((a, b) => a.position - b.position);
  return collected.map((c) => c.video);
};
```

- [ ] **Step 2: `schemas/signage.ts`**

Create `packages/shared/src/schemas/signage.ts`:

```ts
import { z } from 'zod';

// `GET /api/signage/playlist`
export const signagePlaylistItemSchema = z.object({
  videoId: z.string(),
  title: z.string().optional(),
});

export const signagePlaylistResponseSchema = z.object({
  items: z.array(signagePlaylistItemSchema),
  // 次回取得推奨時刻（ISO 8601 UTC）。クライアントのポーリング間隔ヒント＝キャッシュ満了時刻。
  refreshAt: z.string(),
});

export type SignagePlaylistItem = z.infer<typeof signagePlaylistItemSchema>;
export type SignagePlaylistResponse = z.infer<typeof signagePlaylistResponseSchema>;
```

- [ ] **Step 3: barrel に追加** — `packages/shared/src/schemas/index.ts` に `export * from './signage';` を追加。

- [ ] **Step 4: 型チェック** — Run: `pnpm --filter @tecnova/shared type-check`。

- [ ] **Step 5: コミット**

```bash
git add packages/shared/src/youtube.ts packages/shared/src/schemas/signage.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add YouTube Data API wrapper and signage playlist schema"
```

---

## Task 3: API `GET /api/signage/playlist`（route ＋ lib ＋ Bindings ＋ mount ＋ 設定）

**Files:**
- Modify: `apps/api/src/types.ts`
- Create: `apps/api/src/lib/signage.ts`
- Create: `apps/api/src/routes/signage.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/.dev.vars`（ローカル・git管理外）/ `.env.example`

- [ ] **Step 1: `Bindings` に YouTube env を追加**

`apps/api/src/types.ts` の `Bindings` に `TRUSTED_ORIGINS` の後ろへ：

```ts
  YOUTUBE_API_KEY: string;
  YOUTUBE_PLAYLIST_ID: string;
```

- [ ] **Step 2: `lib/signage.ts`（数分の module-scope キャッシュ）**

Create `apps/api/src/lib/signage.ts`:

```ts
import { fetchPlaylistVideos, type YouTubePlaylistVideo } from '@tecnova/shared/youtube';
import type { Bindings } from '../types';

// プレイリストはサーバ側で数分キャッシュする。Data API のクォータ節約と、プレイリスト
// 更新の反映遅延（数分）は許容（spec §5.1）。Workers がリサイクルされたら自然に再取得。
const CACHE_TTL_MS = 5 * 60_000;

let cache: { items: YouTubePlaylistVideo[]; expiresAt: number } | null = null;

export interface SignagePlaylist {
  items: YouTubePlaylistVideo[];
  refreshAt: string;
}

export const fetchSignagePlaylist = async (env: Bindings): Promise<SignagePlaylist> => {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    const items = await fetchPlaylistVideos(env.YOUTUBE_API_KEY, env.YOUTUBE_PLAYLIST_ID);
    cache = { items, expiresAt: now + CACHE_TTL_MS };
  }
  return { items: cache.items, refreshAt: new Date(cache.expiresAt).toISOString() };
};
```

- [ ] **Step 3: `routes/signage.ts`**

Create `apps/api/src/routes/signage.ts`:

```ts
import { Hono } from 'hono';
import { fetchSignagePlaylist } from '../lib/signage';
import type { AppEnv } from '../types';

export const signageRoute = new Hono<AppEnv>();

// requireAuthenticatedMentor は index.ts で /api/* に適用済みなので、ここでは付けない。
// 取得失敗（APIキー未設定・YouTube エラー等）は throw され apiErrorHandler が 500 化し、
// クライアントは §5.4 のフォールバック videoId に倒れる。
signageRoute.get('/playlist', async (c) => c.json(await fetchSignagePlaylist(c.env)));
```

- [ ] **Step 4: `index.ts` にマウント** — import を追加し、`app.route('/api/pre-registrations', preRegistrationsRoute);` の後ろに `app.route('/api/signage', signageRoute);` を追加（`/api/*` の auth ミドルウェアは登録済みなので自動適用）。

- [ ] **Step 5: 設定（`.dev.vars` / `.env.example`）**

`apps/api/.dev.vars`（git管理外・実値）の `TRUSTED_ORIGINS` に `http://localhost:3002` を追記し、`YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` を追加：

```
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
YOUTUBE_API_KEY=<YouTube Data API 限定キー>
YOUTUBE_PLAYLIST_ID=<対象プレイリストID>
```

`.env.example` には**名前のみ**（Public リポジトリ方針）。`TRUSTED_ORIGINS` 例コメントに signage(3002) を含める。

- [ ] **Step 6: 型チェック** — Run: `pnpm --filter @tecnova/api type-check`。

- [ ] **Step 7: 疎通（手動・任意）** — `.dev.vars` に実 YouTube キーがあれば、ログイン済みブラウザから `GET http://localhost:8787/api/signage/playlist` が 200・`items[].videoId` を `position` 昇順で返すこと、未ログインで 401、数分キャッシュ（連続呼び出しで Data API を叩かない）を確認。

- [ ] **Step 8: コミット**

```bash
git add apps/api/src/types.ts apps/api/src/lib/signage.ts apps/api/src/routes/signage.ts apps/api/src/index.ts .env.example
git commit -m "feat(api): add GET /api/signage/playlist (YouTube Data API, cached)"
```
（`.dev.vars` は git 管理外のためコミットしない。）

---

## Task 4: `apps/signage` スキャフォルド（:3002 で起動するところまで）

**Files（すべて新規・`apps/signage/` 配下）:**
- `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- `src/app/layout.tsx`（暫定）/ `src/app/page.tsx`（暫定）/ `src/app/manifest.ts`

- [ ] **Step 1: `package.json`**（checkin から複製し `@zxing/browser` を除外、`@types/youtube` を devDep に追加）

```json
{
  "name": "signage",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@tabler/icons-react": "^3.42.0",
    "@tecnova/shared": "workspace:*",
    "@tecnova/ui": "workspace:*",
    "better-auth": "^1.6.9",
    "motion": "^12.40.0",
    "next": "16.2.4",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/youtube": "^0.1.0",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: ビルド設定ファイル**

`next.config.ts`（checkin と同じ・`viewTransition` は使わないので省略可）:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // モノレポ内 workspace パッケージを Next の transpile 対象にする
  transpilePackages: ['@tecnova/shared', '@tecnova/ui'],
};

export default nextConfig;
```

`postcss.config.mjs`: `export { default } from '@tecnova/ui/postcss.config';`

`tsconfig.json`（checkin と同一。`paths` に `@/*` と `@tecnova/ui/*`）。`components.json`（checkin と同一）。`.gitignore`（checkin から verbatim コピー：`/node_modules`・`/.next/`・`.env*`・`next-env.d.ts` 等）。

- [ ] **Step 3: 暫定 layout / manifest / page**

`src/app/manifest.ts`（**`display: 'fullscreen'`・`orientation: 'landscape'`**）:

```ts
import type { MetadataRoute } from 'next';

// 壁掛けモニター向け。display:'fullscreen' + orientation:'landscape' が最も強いキオスク表示。
// アイコンは省略（--kiosk 起動では PWA インストール不要）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'テクノバながさき サイネージ',
    short_name: 'サイネージ',
    description: 'テクノバながさきの会場サイネージ表示',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#020617',
    theme_color: '#2563eb',
    lang: 'ja',
  };
}
```

`src/app/layout.tsx`（暫定：この時点では AppShell 未作成なので children 直描画。Task 5 で AppShell に差し替える）:

```tsx
import type { Metadata, Viewport } from 'next';
import { LINE_Seed_JP } from 'next/font/google';
import '@tecnova/ui/globals.css';
import { cn } from '@tecnova/ui/lib/utils';

const fontSans = LINE_Seed_JP({
  variable: '--font-sans',
  weight: ['100', '400', '700', '800'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'テクノバ サイネージ',
  appleWebApp: { capable: true, title: 'サイネージ', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={cn('h-full antialiased font-sans', fontSans.variable)}>
      <body className="min-h-full bg-slate-950">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`（暫定プレースホルダ。Task 12 で状態機械に差し替える）:

```tsx
export default function SignagePage() {
  return <main className="flex min-h-svh items-center justify-center text-white">signage</main>;
}
```

- [ ] **Step 4: インストールして起動確認** — Run: `pnpm install` → `pnpm --filter signage dev`（`http://localhost:3002` が「signage」を表示）。
- [ ] **Step 5: 型チェック** — Run: `pnpm --filter signage type-check`。
- [ ] **Step 6: コミット**

```bash
git add apps/signage pnpm-lock.yaml
git commit -m "feat(signage): scaffold Next.js app on port 3002"
```

---

## Task 5: 認証ゲート（auth-client / AppShell / login）

**Files:**
- Create: `apps/signage/src/lib/auth-client.ts`
- Create: `apps/signage/src/components/app-shell.tsx`
- Create: `apps/signage/src/app/login/page.tsx`
- Modify: `apps/signage/src/app/layout.tsx`

- [ ] **Step 1: Better Auth クライアント**（checkin と同一）

```ts
import { createAuthClient } from 'better-auth/react';

// Worker（API）の URL。本番では NEXT_PUBLIC_API_URL を Vercel 側で設定する。
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// クッキーは Worker 側オリジンに発行される。サイネージは別オリジンから fetch するため
// credentials:'include' でクッキーを同送させる（API の TRUSTED_ORIGINS に 3002 を登録済み）。
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: 'include' },
});
```

- [ ] **Step 2: AppShell（最小・ヘッダ chrome なし＝全画面サイネージ）**

```tsx
'use client';

import { MeProvider } from '@tecnova/ui/components/me-provider';
import { usePathname } from 'next/navigation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /login は認証ゲートの外（401 時の遷移先）。
  if (pathname.startsWith('/login')) {
    return <>{children}</>;
  }
  return (
    <MeProvider
      forbiddenMessage="サイネージの利用権限がありません"
      loadingClassName="flex min-h-svh items-center justify-center bg-slate-950 text-slate-300"
      forbiddenClassName="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-slate-300"
      errorClassName="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-slate-300"
    >
      {children}
    </MeProvider>
  );
}
```

- [ ] **Step 3: ログインページ（自己完結・`@tecnova/ui` のみ依存）**

```tsx
'use client';

import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // callbackURL は絶対URL（フロントのオリジンに戻す）。相対だと API オリジンに着地する。
      const redirect = `${window.location.origin}/`;
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: redirect,
        errorCallbackURL: redirect,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-950 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">テクノバ サイネージ</CardTitle>
        </CardHeader>
        {error && (
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>ログインエラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
        <CardFooter className="flex-col gap-3">
          <Button type="button" size="lg" onClick={signIn} disabled={busy} className="w-full">
            {busy ? 'リダイレクト中...' : 'Google でログイン（共有アカウント）'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            許可リストに登録されたアカウントのみ利用できます
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: layout を AppShell でラップ** — `import { AppShell } from '@/components/app-shell';` を足し、body を `<AppShell>{children}</AppShell>` に差し替え。
- [ ] **Step 5: 型チェック** — Run: `pnpm --filter signage type-check`。
- [ ] **Step 6: 認証ゲートを手動確認**（未ログインで `/login`、ログイン後にプレースホルダ表示）。
- [ ] **Step 7: コミット**

```bash
git add apps/signage/src
git commit -m "feat(signage): add mentor-whitelist auth (auth-client, MeProvider shell, login)"
```

---

## Task 6: 時刻ソースとユーティリティ（`now` / `use-now` / `time` / `use-wake-lock`）

**Files:**
- Create: `apps/signage/src/lib/now.ts` / `use-now.ts` / `time.ts` / `use-wake-lock.ts`

- [ ] **Step 1: `now.ts`（`?now=` 上書き対応の時刻ソース）**

```ts
// 端末のローカル時計を返す。?now=ISO クエリがある場合のみ、その時刻を起点に
// 実時間の経過分だけ進めた擬似時刻を返す（タイムベース挙動の手動検証用）。
let anchor: { base: number; mountedAt: number } | null | undefined;

const readAnchor = (): { base: number; mountedAt: number } | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('now');
  if (!raw) return null;
  const base = new Date(raw).getTime();
  if (Number.isNaN(base)) return null;
  return { base, mountedAt: Date.now() };
};

export const getNow = (): Date => {
  if (anchor === undefined) anchor = readAnchor();
  if (anchor === null) return new Date();
  return new Date(anchor.base + (Date.now() - anchor.mountedAt));
};
```

- [ ] **Step 2: `use-now.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import { getNow } from './now';

// 表示更新用に一定間隔で現在時刻を返す（チャイム発火は use-chime-scheduler が別途精密に行う）。
export const useNow = (intervalMs = 1000): Date => {
  const [now, setNow] = useState<Date>(() => getNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};
```

- [ ] **Step 3: `time.ts`**

```ts
const jstHmFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// JST の 'HH:mm'。
export const jstHm = (date: Date): string => jstHmFormatter.format(date);

// 秒数を 'M:SS' に（休憩カウントダウン用）。負値は 0 扱い。
export const mmss = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};
```

- [ ] **Step 4: `use-wake-lock.ts`**

```ts
'use client';

import { useEffect } from 'react';

// 画面スリープ防止。document が hidden になると OS が自動解放するため
// visibilitychange で再取得する。HTTPS（secure context）必須。
export const useWakeLock = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;

    const request = async (): Promise<void> => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // low battery / hidden などで拒否されうる（ベストエフォート）。
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
};
```

- [ ] **Step 5: 型チェック** — Run: `pnpm --filter signage type-check`。
- [ ] **Step 6: コミット**

```bash
git add apps/signage/src/lib
git commit -m "feat(signage): add time utils (now override, useNow, jst/mmss) and wake lock hook"
```

---

## Task 7: チャイム音（Web Audio 合成）`chimes.ts`

**Files:** Create `apps/signage/src/lib/chimes.ts`

- [ ] **Step 1: 実装**

```ts
import type { ChimeKind } from '@tecnova/shared/activity-cycle';

// 単一の AudioContext を使い回す（ブラウザは同時 context 数を制限するため）。
let ctx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!ctx) ctx = new AudioContext();
  return ctx;
};

// 起動タップ内で呼ぶ。自動再生制約を解放する。
export const resumeAudio = async (): Promise<void> => {
  const c = getCtx();
  if (c.state !== 'running') await c.resume();
};

// suspended に戻っていれば再開（OS スリープ後・タブ復帰時）。
export const ensureAudioRunning = async (): Promise<void> => {
  if (ctx && ctx.state !== 'running') await ctx.resume();
};

const tone = (
  c: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  type: OscillatorType,
): void => {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // 指数エンベロープでベル風の余韻（0 には到達できないので 0.0001 へ）。
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.5, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
};

// 種別ごとに音色・音程を変える。
const PATTERNS: Record<ChimeKind, { freqs: [number, number]; type: OscillatorType; dur: number }> = {
  resume: { freqs: [784, 988], type: 'sine', dur: 0.7 }, // 上行＝再開
  break: { freqs: [988, 784], type: 'sine', dur: 0.8 }, // 下行＝休憩（キンコン）
  'term-end': { freqs: [880, 587], type: 'triangle', dur: 1.2 }, // 長め＝ターム終了
};

export const playChime = (kind: ChimeKind): void => {
  const c = getCtx();
  if (c.state !== 'running') return; // 解放前は鳴らさない
  const { freqs, type, dur } = PATTERNS[kind];
  const t = c.currentTime + 0.02;
  tone(c, freqs[0], t, dur, type);
  tone(c, freqs[1], t + 0.45, dur, type);
};
```

- [ ] **Step 2: 型チェック** → **Step 3: コミット**

```bash
git add apps/signage/src/lib/chimes.ts
git commit -m "feat(signage): synthesize chime tones via Web Audio"
```

---

## Task 8: チャイムスケジューラ `use-chime-scheduler.ts`

**Files:** Create `apps/signage/src/lib/use-chime-scheduler.ts`

- [ ] **Step 1: 実装（自己補正 setTimeout ＋ key dedup）**

```ts
'use client';

import { type ChimeEvent, cycleChimeEventsForDay } from '@tecnova/shared/activity-cycle';
import { useEffect, useRef } from 'react';

interface Args {
  enabled: boolean; // 音声解放済みか（起動タップ後）
  isTermActive: (term: ChimeEvent['term']) => boolean; // 稼働判定
  onChime: (event: ChimeEvent) => void; // 発火時の副作用（playChime 等）
  getNow: () => Date;
}

// 壁時計の :00/:50 等の境界でちょうど発火させる。setInterval は使わず、毎 tick
// Date から次境界までの遅延を再計算する（ドリフトしない）。key で二重発火を防ぐ。
export const useChimeScheduler = ({ enabled, isTermActive, onChime, getNow }: Args): void => {
  const isActiveRef = useRef(isTermActive);
  const onChimeRef = useRef(onChime);
  const getNowRef = useRef(getNow);
  isActiveRef.current = isTermActive;
  onChimeRef.current = onChime;
  getNowRef.current = getNow;

  useEffect(() => {
    if (!enabled) return;
    const fired = new Set<string>();
    let last = getNowRef.current().getTime();
    let timer = 0;

    const tick = (): void => {
      const now = getNowRef.current().getTime();
      const events = cycleChimeEventsForDay(new Date(now));
      for (const e of events) {
        const at = e.at.getTime();
        if (at > last && at <= now && !fired.has(e.key)) {
          fired.add(e.key);
          if (isActiveRef.current(e.term)) onChimeRef.current(e);
        }
      }
      last = now;
      const nextAt = events
        .map((e) => e.at.getTime())
        .filter((t) => t > now)
        .sort((a, b) => a - b)[0];
      const delay = nextAt === undefined ? 1000 : Math.min(1000, Math.max(50, nextAt - now));
      timer = window.setTimeout(tick, delay);
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };

    timer = window.setTimeout(tick, 0);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
};
```

- [ ] **Step 2: 型チェック** → **Step 3: コミット**

```bash
git add apps/signage/src/lib/use-chime-scheduler.ts
git commit -m "feat(signage): drift-free chime scheduler with per-boundary dedupe"
```

---

## Task 9: ライブデータ取得 `use-signage-data.ts`

**Files:** Create `apps/signage/src/lib/use-signage-data.ts`

- [ ] **Step 1: 実装（`/api/sessions/today` をポーリングしターム別に集計）**

```ts
'use client';

import type { TodaySessionsResponse } from '@tecnova/shared/schemas';
import type { TermId } from '@tecnova/shared/venue-schedule';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';

export interface SignageData {
  currentlyPresent: number;
  totalCheckedIn: number;
  termCounts: Record<TermId, number>;
}

const EMPTY: SignageData = {
  currentlyPresent: 0,
  totalCheckedIn: 0,
  termCounts: { morning: 0, afternoon: 0, evening: 0 },
};

const POLL_MS = 20_000;

// 認証付き /api/sessions/today を ~20秒間隔で取得。ターム別 checkedIn は
// sessions[].term の件数（累計＝ターム終了まで sticky）。失敗時は直近値を保持。
export const useSignageData = (): SignageData => {
  const [data, setData] = useState<SignageData>(EMPTY);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<TodaySessionsResponse>('/api/sessions/today');
        if (!active) return;
        const termCounts: Record<TermId, number> = { morning: 0, afternoon: 0, evening: 0 };
        for (const s of res.sessions) {
          if (s.term) termCounts[s.term] += 1;
        }
        setData({
          currentlyPresent: res.summary.currentlyPresent,
          totalCheckedIn: res.summary.totalCheckedIn,
          termCounts,
        });
      } catch {
        // ネットワーク不達時は直近値を維持（degrade）。
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return data;
};
```

- [ ] **Step 2: 型チェック** → **Step 3: コミット**

```bash
git add apps/signage/src/lib/use-signage-data.ts
git commit -m "feat(signage): poll /api/sessions/today and derive per-term counts"
```

---

## Task 10: 動画レイヤ（YouTube・自前キュー・無音トグル）

**Files:**
- Create: `apps/signage/src/config/playlist.ts`
- Create: `apps/signage/src/lib/use-playlist.ts`
- Create: `apps/signage/src/lib/use-mute.ts`
- Create: `apps/signage/src/lib/use-youtube-player.ts`
- Create: `apps/signage/src/components/youtube-player.tsx`
- Create: `apps/signage/src/components/mute-toggle.tsx`

- [ ] **Step 1: フォールバック設定 `config/playlist.ts`**

```ts
// API（/api/signage/playlist）が主ソース。取得失敗・空配列・ローカル開発時のみ
// この配列を自前キューに流す（spec §5.4）。動画 URL ではなく YouTube の videoId を列挙する。
// 例: 'dQw4w9WgXcQ'。空のままなら（API も空なら）idle ロゴ的な背景に倒れる。
export const FALLBACK_VIDEO_IDS: string[] = [];
```

- [ ] **Step 2: `use-playlist.ts`（API 取得＋フォールバック）**

```ts
'use client';

import type { SignagePlaylistResponse } from '@tecnova/shared/schemas';
import { apiJson } from '@tecnova/ui/lib/api-client';
import { useEffect, useState } from 'react';
import { FALLBACK_VIDEO_IDS } from '@/config/playlist';

// 起動時 + 数分間隔で /api/signage/playlist を取得し videoId[] を保持する。
// 取得失敗 / 空配列のときは FALLBACK_VIDEO_IDS を採用（spec §5.1 / §5.4）。
const POLL_MS = 5 * 60_000;

export const usePlaylist = (): string[] => {
  const [ids, setIds] = useState<string[]>(FALLBACK_VIDEO_IDS);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const res = await apiJson<SignagePlaylistResponse>('/api/signage/playlist');
        if (!active) return;
        const next = res.items.map((i) => i.videoId);
        setIds(next.length > 0 ? next : FALLBACK_VIDEO_IDS);
      } catch {
        // 取得失敗時は直近の状態を保持（degrade）。初回失敗なら FALLBACK のまま。
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return ids;
};
```

- [ ] **Step 3: `use-mute.ts`（localStorage 永続・既定=無音）**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

// 無音/音ありトグル。既定=無音（true）。localStorage に永続（spec §5.5）。
const STORAGE_KEY = 'signage:muted';

export const useMute = (): { muted: boolean; toggle: () => void } => {
  // SSR では localStorage が無いので既定=無音で初期化し、mount 後に読み出す。
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === 'false') setMuted(false);
  }, []);

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { muted, toggle };
};
```

- [ ] **Step 4: `use-youtube-player.ts`（IFrame ライフサイクル＋自前キュー）**

```ts
'use client';

import { useEffect, useRef } from 'react';

// IFrame Player API は @types/youtube がグローバル名前空間 YT を提供する。
// window.YT / onYouTubeIframeAPIReady は型に無いので最小限で宣言する。
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// IFrame Player API を一度だけ読み込むシングルトン。複数回呼んでも <script> は 1 回。
let apiReadyPromise: Promise<typeof YT> | null = null;

const loadYouTubeApi = (): Promise<typeof YT> => {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT as typeof YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiReadyPromise;
};

interface Args {
  elementId: string;
  videoIds: string[];
  active: boolean; // 活動フェーズ中のみ再生
  muted: boolean; // 無音トグル
  started: boolean; // 起動タップ後（unMute はジェスチャ後のみ）
}

// 生成済み iframe を全画面化し、再生中だけ可視にする（未ロード時は背後のロゴを見せる）。
const styleIframe = (iframe: HTMLIFrameElement, visible: boolean): void => {
  iframe.style.position = 'absolute';
  iframe.style.inset = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.pointerEvents = 'none';
  iframe.style.opacity = visible ? '1' : '0';
};

export const useYoutubePlayer = ({ elementId, videoIds, active, muted, started }: Args): void => {
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const indexRef = useRef(0);
  const queueStartedRef = useRef(false); // 1本目を流し始めたか
  // 最新の props を effect 外から参照するための ref。
  const videoIdsRef = useRef(videoIds);
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  const startedRef = useRef(started);
  videoIdsRef.current = videoIds;
  activeRef.current = active;
  mutedRef.current = muted;
  startedRef.current = started;

  // プレーヤー生成は一度だけ。StrictMode の二重マウントは destroy で吸収する。
  useEffect(() => {
    let cancelled = false;

    const loadNext = (): void => {
      const ids = videoIdsRef.current;
      const player = playerRef.current;
      if (!player || ids.length === 0) return;
      indexRef.current = (indexRef.current + 1) % ids.length;
      const next = ids[indexRef.current];
      if (next) player.loadVideoById(next);
    };

    const applyMute = (player: YT.Player): void => {
      if (startedRef.current && !mutedRef.current) player.unMute();
      else player.mute();
    };

    void loadYouTubeApi().then((YTApi) => {
      if (cancelled || playerRef.current) return;
      const first = videoIdsRef.current[0];
      queueStartedRef.current = first !== undefined;
      playerRef.current = new YTApi.Player(elementId, {
        videoId: first,
        // controls/fs/kb/関連UI を抑止。rel=0 は限定的だが残す。mute:1 でミュート自動再生を保証。
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
          autoplay: 1,
          mute: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            readyRef.current = true;
            const player = e.target;
            styleIframe(player.getIframe(), queueStartedRef.current);
            if (activeRef.current) player.playVideo();
            else player.pauseVideo();
            applyMute(player);
          },
          // ENDED 直前ではなく ENDED で次へ差し替え。プレーヤーを「終了状態」に長く
          // 留めないことで関連グリッド/up-next を実質抑止する（spec §5.2）。
          onStateChange: (e) => {
            if (e.data === YTApi.PlayerState.ENDED) loadNext();
          },
          // 100=削除/非公開, 101/150=埋め込み禁止 → 次へ送ってキューを止めない。
          onError: () => loadNext(),
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      queueStartedRef.current = false;
      indexRef.current = 0;
    };
  }, [elementId]);

  // 生成時に空だった場合の救済：プレイリストが初めて埋まったらキュー先頭から再生開始。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || queueStartedRef.current) return;
    const first = videoIds[0];
    if (first === undefined) return;
    queueStartedRef.current = true;
    indexRef.current = 0;
    player.loadVideoById(first);
    styleIframe(player.getIframe(), true);
  }, [videoIds]);

  // 活動フェーズで再生 / それ以外で一時停止。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (active) player.playVideo();
    else player.pauseVideo();
  }, [active]);

  // 起動タップ後・音ありモードのときだけ unMute。それ以外はミュート。
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (started && !muted) player.unMute();
    else player.mute();
  }, [started, muted]);
};
```

- [ ] **Step 5: `youtube-player.tsx`（動画レイヤ＝旧 stage.tsx 置換）**

```tsx
'use client';

import { useYoutubePlayer } from '@/lib/use-youtube-player';

const PLAYER_ELEMENT_ID = 'signage-youtube-player';

interface Props {
  videoIds: string[];
  active: boolean;
  muted: boolean;
  started: boolean;
}

// IFrame は常時マウント（再読込フラッシュ防止）。未ロード時は背後のワードマークを見せ、
// 動画ロード後に iframe を opacity:1 で前に出す（use-youtube-player が制御）。
export function YoutubePlayer({ videoIds, active, muted, started }: Props) {
  useYoutubePlayer({ elementId: PLAYER_ELEMENT_ID, videoIds, active, muted, started });

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-black tracking-wide text-white/10">tec-nova Nagasaki</span>
      </div>
      {/* YT.Player がこの div を iframe に置換し、JS 側で全画面化＋可視制御する。 */}
      <div id={PLAYER_ELEMENT_ID} />
    </div>
  );
}
```

- [ ] **Step 6: `mute-toggle.tsx`（運用者向け控えめな小コントロール）**

```tsx
'use client';

import { IconVolume, IconVolumeOff } from '@tabler/icons-react';

interface Props {
  muted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ muted, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? '動画の音声をオンにする' : '動画の音声をオフにする'}
      className="absolute right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full bg-slate-950/50 text-white/70 backdrop-blur transition hover:text-white"
    >
      {muted ? <IconVolumeOff className="size-5" /> : <IconVolume className="size-5" />}
    </button>
  );
}
```

- [ ] **Step 7: 型チェック** — Run: `pnpm --filter signage type-check`（`@types/youtube` の `YT.Player` 等が解決すること）。
- [ ] **Step 8: コミット**

```bash
git add apps/signage/src/config/playlist.ts apps/signage/src/lib/use-playlist.ts apps/signage/src/lib/use-mute.ts apps/signage/src/lib/use-youtube-player.ts apps/signage/src/components/youtube-player.tsx apps/signage/src/components/mute-toggle.tsx
git commit -m "feat(signage): YouTube IFrame self-queue player, playlist fetch, mute toggle"
```

---

## Task 11: 表示コンポーネント（info-bar / break-screen / idle-screen / tap-to-start）

**Files:** Create `apps/signage/src/components/{info-bar,break-screen,idle-screen,tap-to-start}.tsx`

- [ ] **Step 1: InfoBar（活動中の上部バー）**

```tsx
'use client';

import { TERM_LABELS, type TermId } from '@tecnova/shared/venue-schedule';
import { jstHm, mmss } from '@/lib/time';

interface Props {
  term: TermId;
  now: Date;
  present: number;
  secondsToBreak: number | null;
}

export function InfoBar({ term, now, present, secondsToBreak }: Props) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-slate-950/55 px-6 py-3 text-white backdrop-blur">
      <span className="rounded-full bg-amber-400 px-3 py-0.5 text-sm font-extrabold text-slate-900">
        {TERM_LABELS[term]}の部
      </span>
      <span className="text-2xl font-extrabold tabular-nums">{jstHm(now)}</span>
      {secondsToBreak !== null && (
        <span className="text-base text-slate-200">休憩まで {mmss(secondsToBreak)}</span>
      )}
      <span className="ml-auto text-base text-slate-200">
        在館 <span className="text-xl font-extrabold">{present}</span> 人
      </span>
    </div>
  );
}
```

- [ ] **Step 2: BreakScreen（休憩中・カウントダウン主役、クロスフェード）**

```tsx
'use client';

import { mmss } from '@/lib/time';

interface Props {
  show: boolean;
  secondsToResume: number | null;
  present: number;
}

// 動画レイヤの上に重ね、opacity でクロスフェード。動画は裏で pause（YouTube iframe は
// アンマウントしない＝再読込フラッシュ防止）。prefers-reduced-motion 時は transition を無効化。
export function BreakScreen({ show, secondsToResume, present }: Props) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-slate-950 text-white transition-opacity duration-500 motion-reduce:transition-none ${
        show ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="text-3xl font-extrabold text-amber-300">休憩中</p>
      <p className="text-[10rem] font-black leading-none tabular-nums">
        {secondsToResume !== null ? mmss(secondsToResume) : '--:--'}
      </p>
      <p className="text-2xl text-slate-300">再開までの時間</p>
      <p className="text-lg text-slate-400">
        在館 <span className="font-extrabold text-slate-200">{present}</span> 人
      </p>
    </div>
  );
}
```

- [ ] **Step 3: IdleScreen（待機・営業時間外／稼働前）**

```tsx
'use client';

import { jstHm } from '@/lib/time';

interface Props {
  show: boolean;
  soon: boolean; // ターム内だが未稼働（初回チェックイン前）＝「まもなく開始」
  now: Date;
  nextStartAt: Date | null; // 次の活動開始（境界）。ターム外のときのみ算出。
  present: number;
}

export function IdleScreen({ show, soon, now, nextStartAt, present }: Props) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-slate-950 text-white transition-opacity duration-500 motion-reduce:transition-none ${
        show ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="text-5xl font-black tracking-wide">tec-nova Nagasaki</p>
      <p className="text-6xl font-extrabold tabular-nums">{jstHm(now)}</p>
      <p className="text-2xl text-slate-300">
        {soon ? 'まもなく開始' : nextStartAt ? `次は ${jstHm(nextStartAt)} から` : '本日は終了しました'}
      </p>
      {present > 0 && <p className="text-lg text-slate-400">在館 {present} 人</p>}
    </div>
  );
}
```

- [ ] **Step 4: TapToStart（音声解放ゲート）**

```tsx
'use client';

interface Props {
  onStart: () => void;
}

export function TapToStart({ onStart }: Props) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-slate-950 text-white"
    >
      <span className="text-6xl">▶</span>
      <span className="text-3xl font-extrabold">タップして開始</span>
      <span className="text-base text-slate-400">チャイム・全画面表示を有効にします</span>
    </button>
  );
}
```

- [ ] **Step 5: 型チェック** → **Step 6: コミット**

```bash
git add apps/signage/src/components/info-bar.tsx apps/signage/src/components/break-screen.tsx apps/signage/src/components/idle-screen.tsx apps/signage/src/components/tap-to-start.tsx
git commit -m "feat(signage): info-bar, break/idle screens, tap-to-start overlay"
```

---

## Task 12: 状態機械の結線 `page.tsx`

**Files:** Modify `apps/signage/src/app/page.tsx`

- [ ] **Step 1: 本体を実装（暫定プレースホルダを置き換え）**

```tsx
'use client';

import {
  type ChimeEvent,
  classifyCycleMoment,
  msUntilNextBoundary,
} from '@tecnova/shared/activity-cycle';
import { useCallback, useEffect, useState } from 'react';
import { BreakScreen } from '@/components/break-screen';
import { IdleScreen } from '@/components/idle-screen';
import { InfoBar } from '@/components/info-bar';
import { MuteToggle } from '@/components/mute-toggle';
import { TapToStart } from '@/components/tap-to-start';
import { YoutubePlayer } from '@/components/youtube-player';
import { ensureAudioRunning, playChime, resumeAudio } from '@/lib/chimes';
import { getNow } from '@/lib/now';
import { useChimeScheduler } from '@/lib/use-chime-scheduler';
import { useMute } from '@/lib/use-mute';
import { useNow } from '@/lib/use-now';
import { usePlaylist } from '@/lib/use-playlist';
import { useSignageData } from '@/lib/use-signage-data';
import { useWakeLock } from '@/lib/use-wake-lock';

export default function SignagePage() {
  const [started, setStarted] = useState(false);
  const now = useNow(1000);
  const data = useSignageData();
  const videoIds = usePlaylist();
  const { muted, toggle } = useMute();
  const moment = classifyCycleMoment(now);

  const isTermActive = useCallback(
    (term: 'morning' | 'afternoon' | 'evening') => data.termCounts[term] > 0,
    [data.termCounts],
  );

  // 現タームが稼働中（初回チェックイン済み）なら moment.phase、未稼働/ターム外は idle。
  const active = moment.term !== null && isTermActive(moment.term);
  const phase = active ? moment.phase : 'idle';

  useWakeLock(started);

  const onChime = useCallback((e: ChimeEvent) => {
    playChime(e.kind);
  }, []);
  useChimeScheduler({ enabled: started, isTermActive, onChime, getNow });

  // タブ復帰時に AudioContext が suspended に戻っていれば再開する（spec §6）。
  useEffect(() => {
    if (!started) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void ensureAudioRunning();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [started]);

  const handleStart = async (): Promise<void> => {
    await resumeAudio();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // 全画面はベストエフォート（dev では拒否されうる）。
    }
    setStarted(true);
  };

  // フェーズ終端までの秒（活動→休憩 / 休憩→再開）。
  const phaseSecondsLeft =
    moment.phaseEndsAt === null
      ? null
      : Math.ceil((moment.phaseEndsAt.getTime() - now.getTime()) / 1000);

  // idle の理由を区別：ターム内・未稼働なら「まもなく開始」、ターム外なら次タームの開始時刻。
  const inUnstartedTerm = moment.term !== null && !active;
  // 次の活動開始（次境界＝次タームの resume）はターム外のときだけ算出する
  // （ターム内・未稼働で算出すると次境界が break になり「次は HH:MM から」が誤表示になる）。
  const msNext = moment.term === null ? msUntilNextBoundary(now) : null;
  const nextStartAt = msNext === null ? null : new Date(now.getTime() + msNext);

  return (
    <main className="relative h-svh w-screen overflow-hidden bg-slate-950 text-white">
      {/* 動画は活動フェーズで再生。起動タップ前でもミュート自動再生で映像は出る（spec §6）。 */}
      <YoutubePlayer
        videoIds={videoIds}
        active={phase === 'activity'}
        muted={muted}
        started={started}
      />

      {phase === 'activity' && moment.term && (
        <InfoBar
          term={moment.term}
          now={now}
          present={data.currentlyPresent}
          secondsToBreak={phaseSecondsLeft}
        />
      )}

      <BreakScreen
        show={phase === 'break'}
        secondsToResume={phaseSecondsLeft}
        present={data.currentlyPresent}
      />

      <IdleScreen
        show={phase === 'idle'}
        soon={inUnstartedTerm}
        now={now}
        nextStartAt={nextStartAt}
        present={data.currentlyPresent}
      />

      {/* 無音トグルは起動後のみ表示（運用者向け）。既定は無音。 */}
      {started && <MuteToggle muted={muted} onToggle={toggle} />}

      {!started && <TapToStart onStart={handleStart} />}
    </main>
  );
}
```

- [ ] **Step 2: 型チェック** — Run: `pnpm --filter signage type-check`。

- [ ] **Step 3: 手動 E2E（時刻上書きで全状態を確認）** — `pnpm --filter signage dev` ＋ api 起動 ＋ ログイン済み。`?now=` で擬似時刻、ローカル D1 に当日セッションを1件入れて稼働させる：
  - `?now=2026-05-30T09:30:00` → 「タップして開始」→ 当該タームに当日チェックインがあれば activity（YouTube動画＋情報バー「休憩まで …」）。無ければ idle「**まもなく開始**」。
  - `?now=2026-05-30T09:49:50` → 数秒後に :50 → break 画面にクロスフェード＋休憩チャイム。
  - `?now=2026-05-30T09:59:50` → :00 で activity に戻り再開チャイム。動画が**自前キューで次へ即差し替え**（関連動画/終了画面が出ない）こと、`prefers-reduced-motion` でトランジション縮約を確認。
  - `?now=2026-05-30T12:30:00` → idle（「次は 13:00 から」）。

- [ ] **Step 4: 無音トグル** — 既定が無音（`mute:1`・映像のみ）、トグルで音あり↔無音が切替わり localStorage 永続、音ありは起動タップ後に `unMute()` で鳴ること、無音でもチャイムが鳴ることを確認。

- [ ] **Step 5: 全体型チェック＆Lint** — `pnpm type-check` / `pnpm biome check .`（必要なら `--write`）。

- [ ] **Step 6: コミット**

```bash
git add apps/signage/src/app/page.tsx
git commit -m "feat(signage): wire phase state machine (YouTube/break/idle + chimes + mute)"
```

---

## Task 13: ドキュメント（アプリ docs ＋ architecture 追記）

**Files:**
- Create: `apps/signage/AGENTS.md` / `apps/signage/CLAUDE.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: `AGENTS.md`**（checkin と同一）

```markdown
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
```

- [ ] **Step 2: `CLAUDE.md`**

```markdown
@AGENTS.md

# signage（会場サイネージ / 大型モニター・キオスク）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3002`（`next dev --port 3002`）。api は `8787`、checkin は `3000`、admin は `3001`。
- **認証あり**: checkin/admin と同じメンター・ホワイトリスト（`MeProvider`/`auth-client`）。運用は**テクノバ共有の管理用 Google アカウント**で1回ログイン（セッション既定7日）。`useMe` はツリー内に `MeProvider` 必須。
- **データ**: 認証付き `GET /api/sessions/today` を再利用（稼働判定・在館数）。ターム別チェックイン数は `sessions[].term` から算出し、**現タームに当日チェックインが入った時点で稼働開始**（ターム終了まで sticky）。
- **時刻ロジック**: `@tecnova/shared/activity-cycle`（50分活動/10分休憩・チャイム時刻）。表示の時刻上書きは `?now=ISO`（手動検証用）。
- **動画**: YouTube IFrame Player API の自前キュー。再生順は YouTube のプレイリストを `GET /api/signage/playlist`（YouTube Data API・Worker キャッシュ）が videoId 列にして返す。フォールバックは `src/config/playlist.ts` の `FALLBACK_VIDEO_IDS`。**広告は埋め込み側で消せない**（spec §5.3）。
- **音声**: 無音/音ありのグローバルトグルのみ（既定=無音・localStorage）。BGM は **OS側 Spotify**（アプリ非統合）。チャイムは Web Audio 合成で独立。
- **キオスク**: 横向き・フルスクリーン。起動「タップして開始」で**チャイム解放・全画面・wake lock**（＋音ありモード時のみ動画 unMute）。ミュート動画はタップ前から再生。本番は Chromium を `--kiosk` 等で起動。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時 `http://localhost:8787`）。API 側 `TRUSTED_ORIGINS` にサイネージ origin（dev: `http://localhost:3002`、本番ドメイン）と `YOUTUBE_API_KEY`/`YOUTUBE_PLAYLIST_ID` を登録すること。
- 新しい `@tecnova/*` パッケージを使うときは `next.config.ts` の `transpilePackages` に追加。
```

- [ ] **Step 3: `docs/architecture.md` にサイネージを追記** — クライアント一覧に `apps/signage`（会場サイネージ・大型モニター・メンター認証・`/api/sessions/today` 再利用・`activity-cycle` 連動・YouTube 動画レイヤ）を既存記法で1行追加。拡張ロードマップ側にも一文（サイネージ＝Phase 拡張で追加、機微コンテンツは同じ認証配下の `/api/signage/*` で拡張予定）。

- [ ] **Step 4: Lint** — `pnpm biome check .`。
- [ ] **Step 5: コミット**

```bash
git add apps/signage/AGENTS.md apps/signage/CLAUDE.md docs/architecture.md
git commit -m "docs(signage): add app CLAUDE.md/AGENTS.md and architecture entry"
```

---

## 動作確認サマリ（全タスク後）

1. `pnpm --filter @tecnova/shared test` … activity-cycle の単体テスト green。
2. `pnpm type-check` … 全 workspace 型エラーなし。
3. `pnpm biome check .` … lint/format クリーン。
4. `pnpm dev` 後、`http://localhost:3002` で：未ログイン→/login→共有アカウントでログイン→「タップして開始」→ `?now=` で activity/break/idle 遷移とチャイム、YouTube 自前キューの差し替え、無音トグルを確認。
5. 実機キオスク：（音ありモードなら）動画音声・wake lock・全画面、タブ復帰で音声復帰、セッション維持（再読込でログイン不要）を確認。

## 留意点（spec §9 由来）

- 端末ローカル時計依存（NTP 同期推奨）。
- セッション既定7日（長期運用は `apps/api/src/lib/auth.ts` に `session.expiresIn` 追加で延長可）。
- 稼働判定はポーリング間隔（~20秒）分のラグあり。:50 直前の初チェックインは当該休憩チャイムを逃しうる（許容）。
- v1 は `/api/sessions/today` の PII を画面に出さない。将来の機微コンテンツは同じ認証配下の `/api/signage/*` で。
- **YouTube 広告は埋め込み側で消せない**（spec §5.3）。広告ゼロを確実にできるのは YPP 加入チャンネルで収益化オフにした自前動画のみ。プログラム的スキップは ToS 違反。
- **作者エンドスクリーン（カード）**は末尾数秒に重なるため自前キューのサブ秒差し替えでは完全には消えない（spec §5.2・許容）。必要なら末尾数秒手前で切る拡張余地あり。
- **空プレイリスト**（API も `FALLBACK_VIDEO_IDS` も空）の活動フェーズでは、動画レイヤ背後の「tec-nova Nagasaki」ワードマークが見える（黒画面回避）。実運用ではプレイリスト or フォールバックを必ず設定する。
- 起動タップ後の動画 unMute は React effect 経由（タップと同一同期ジェスチャ内ではない）。ページの sticky activation ＋ キオスクの autoplay policy で実用上問題なし。既定の無音モードなら unMute 自体が不要。
