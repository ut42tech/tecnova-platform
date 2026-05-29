# サイネージ＋チャイム アプリ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大型モニター常時表示用の認証付きサイネージアプリ `apps/signage` を新設し、50分活動／10分休憩サイクルに連動した動画表示・カウントダウン・チャイムを自動制御する。

**Architecture:** 端末ローカル時計から純粋ロジック（`@tecnova/shared/activity-cycle`）で活動/休憩フェーズとチャイム時刻を算出し、稼働判定は認証付き既存 `GET /api/sessions/today` のターム別チェックイン数（初回チェックインで稼働開始・ターム終了まで sticky）で行う。画面は L2（動画フルスクリーン＋情報バー）で、フェーズ境界にクロスフェードし Web Audio 合成チャイムを鳴らす。認証は checkin/admin と同じメンター・ホワイトリスト（共有管理アカウントで1回ログイン）。

**Tech Stack:** Next.js 16.2.4 / React 19.2.4 / TypeScript / Tailwind v4（`@tecnova/ui`）/ Better Auth（`better-auth/react`）/ motion / Web Audio API / Screen Wake Lock API / vitest（`packages/shared` のみ新規導入）。

設計の根拠は `docs/superpowers/specs/2026-05-29-signage-chime-design.md` を参照。

---

## File Structure

**packages/shared（共有純粋ロジック）**
- `src/activity-cycle.ts`（新規）— 50/10サイクル分類・チャイムイベント列・カウントダウン
- `src/activity-cycle.test.ts`（新規）— 上記の単体テスト
- `package.json`（変更）— `"./activity-cycle"` export ＋ vitest devDep ＋ `test` スクリプト

**apps/api（設定のみ・コード変更なし）**
- `.dev.vars` / `.env.example`（変更）— `TRUSTED_ORIGINS` にサイネージ origin を追加

**apps/signage（新規アプリ）**
- 設定: `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- 認証: `src/lib/auth-client.ts` / `src/components/app-shell.tsx` / `src/app/login/page.tsx`
- ルート: `src/app/layout.tsx` / `src/app/manifest.ts` / `src/app/page.tsx`（状態機械）
- ロジック: `src/lib/now.ts` / `src/lib/use-now.ts` / `src/lib/time.ts` / `src/lib/chimes.ts` / `src/lib/use-chime-scheduler.ts` / `src/lib/use-wake-lock.ts` / `src/lib/use-signage-data.ts`
- 設定値: `src/config/playlist.ts`
- 表示: `src/components/{stage,info-bar,break-screen,idle-screen,tap-to-start}.tsx`
- ドキュメント: `CLAUDE.md` / `AGENTS.md`

**docs**
- `docs/architecture.md`（変更）— クライアント一覧に `apps/signage` を追記

各ファイルは単一責務。`now.ts`（時刻ソース）・`chimes.ts`（音）・`use-chime-scheduler.ts`（発火）・`use-signage-data.ts`（データ）・各表示コンポーネントは独立して理解・差し替え可能。

---

## Task 1: 共有ロジック `activity-cycle.ts`（TDD・vitest 最小導入）

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/src/activity-cycle.test.ts`
- Create: `packages/shared/src/activity-cycle.ts`

- [ ] **Step 1: vitest を devDep と test スクリプトに追加**

`packages/shared/package.json` の `scripts` と `devDependencies` を以下に変更（他キーは既存のまま）：

```json
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260502.1",
    "typescript": "^6.0.3",
    "vitest": "^3.2.4"
  },
```

そして `exports` に `"./activity-cycle"` を追加（`"./venue-schedule"` の隣）：

```json
  "exports": {
    ".": "./src/index.ts",
    "./google-sheets": "./src/google-sheets.ts",
    "./schemas": "./src/schemas/index.ts",
    "./venue-schedule": "./src/venue-schedule.ts",
    "./activity-cycle": "./src/activity-cycle.ts"
  },
```

- [ ] **Step 2: 依存をインストール**

Run: `pnpm install`
Expected: vitest が `packages/shared` に追加され lockfile 更新。

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

- [ ] **Step 4: テストが失敗することを確認**

Run: `pnpm --filter @tecnova/shared test`
Expected: FAIL（`activity-cycle.ts` 不在で import 解決エラー）。

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

// ref の JST 暦日における JST 通算分 m を UTC instant に変換（termEndInstant と同手法）。
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

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm --filter @tecnova/shared test`
Expected: PASS（全ケース green）。

- [ ] **Step 7: 型チェック**

Run: `pnpm --filter @tecnova/shared type-check`
Expected: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add packages/shared/package.json packages/shared/src/activity-cycle.ts packages/shared/src/activity-cycle.test.ts pnpm-lock.yaml
git commit -m "feat(shared): add activity-cycle (50/10 schedule + chime events)"
```

---

## Task 2: API の `TRUSTED_ORIGINS` にサイネージ origin を追加（設定のみ）

**Files:**
- Modify: `apps/api/.dev.vars`（ローカル開発用・git管理外）
- Modify: `.env.example`（コメント例）

- [ ] **Step 1: `.dev.vars` に dev origin を追加**

`apps/api/.dev.vars` の `TRUSTED_ORIGINS` 行に `http://localhost:3002` を追記（カンマ区切り）：

```
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

- [ ] **Step 2: `.env.example` のコメント例を更新**

`.env.example` の `TRUSTED_ORIGINS` 付近のコメントに signage(3002) を含める（値は空のまま、例コメントのみ）。

- [ ] **Step 3: API を再起動して疎通確認（手動）**

Run: `pnpm --filter @tecnova/api dev`（別ターミナル）
確認: 既存メンター（または共有）アカウントでログイン済みのブラウザから `http://localhost:8787/api/sessions/today` が 200 を返し、`sessions[].term` と `summary.currentlyPresent` を含む。未ログインだと 401。
Expected: 認証付きで取得可能。`TRUSTED_ORIGINS` はコード変更なしで CORS と Better Auth 双方に反映。

- [ ] **Step 4: コミット**

```bash
git add .env.example
git commit -m "chore(api): document signage origin (3002) in TRUSTED_ORIGINS"
```
（`.dev.vars` は git 管理外のためコミットしない。）

---

## Task 3: `apps/signage` スキャフォルド（:3002 で起動するところまで）

**Files（すべて新規・`apps/signage/` 配下）:**
- `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- `src/app/layout.tsx`（暫定）/ `src/app/page.tsx`（暫定）/ `src/app/manifest.ts`

- [ ] **Step 1: `package.json`**

Create `apps/signage/package.json`:

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
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: ビルド設定ファイル**

Create `apps/signage/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // モノレポ内 workspace パッケージを Next の transpile 対象にする
  transpilePackages: ['@tecnova/shared', '@tecnova/ui'],
};

export default nextConfig;
```

Create `apps/signage/postcss.config.mjs`:

```ts
export { default } from '@tecnova/ui/postcss.config';
```

Create `apps/signage/tsconfig.json`（checkin と同一）:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@tecnova/ui/*": ["../../packages/ui/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"],
  "exclude": ["node_modules"]
}
```

Create `apps/signage/components.json`（checkin と同一）:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-maia",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../packages/ui/src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "tabler",
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@tecnova/ui/lib/utils",
    "ui": "@tecnova/ui/components"
  },
  "rtl": false,
  "menuColor": "default-translucent",
  "menuAccent": "subtle"
}
```

Create `apps/signage/.gitignore`（checkin の `.gitignore` を verbatim でコピー： `/node_modules`・`/.next/`・`.env*`・`.vercel`・`next-env.d.ts` 等を含むもの）。

- [ ] **Step 3: 暫定 layout / manifest / page**

Create `apps/signage/src/app/manifest.ts`:

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

Create `apps/signage/src/app/layout.tsx`（暫定：この時点では AppShell 未作成なので children 直描画。Task 4 で AppShell に差し替える）:

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

Create `apps/signage/src/app/page.tsx`（暫定プレースホルダ。Task 10 で状態機械に差し替える）:

```tsx
export default function SignagePage() {
  return <main className="flex min-h-svh items-center justify-center text-white">signage</main>;
}
```

- [ ] **Step 4: インストールして起動確認**

Run: `pnpm install`
Run: `pnpm --filter signage dev`
確認: `http://localhost:3002` が「signage」を表示。
Expected: :3002 で起動。

- [ ] **Step 5: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add apps/signage pnpm-lock.yaml
git commit -m "feat(signage): scaffold Next.js app on port 3002"
```

---

## Task 4: 認証ゲート（auth-client / AppShell / login）

**Files:**
- Create: `apps/signage/src/lib/auth-client.ts`
- Create: `apps/signage/src/components/app-shell.tsx`
- Create: `apps/signage/src/app/login/page.tsx`
- Modify: `apps/signage/src/app/layout.tsx`

- [ ] **Step 1: Better Auth クライアント**

Create `apps/signage/src/lib/auth-client.ts`:

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

- [ ] **Step 2: AppShell（最小・ヘッダなし）**

Create `apps/signage/src/components/app-shell.tsx`（checkin と違い全画面表示なのでヘッダ chrome は持たず、`MeProvider` だけで包む）:

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

Create `apps/signage/src/app/login/page.tsx`:

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

- [ ] **Step 4: layout を AppShell でラップ**

Modify `apps/signage/src/app/layout.tsx` — import を追加し body を差し替え：

```tsx
import { AppShell } from '@/components/app-shell';
```

```tsx
      <body className="min-h-full bg-slate-950">
        <AppShell>{children}</AppShell>
      </body>
```

- [ ] **Step 5: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 6: 認証ゲートを手動確認**

Run: `pnpm --filter signage dev`（api も起動しておく）
確認: 未ログインで `http://localhost:3002` → `/login` へ遷移。共有（or 任意の許可リスト）アカウントでログイン → `/` に戻り「signage」プレースホルダが表示。
Expected: 401→/login、ログイン後に本体表示。

- [ ] **Step 7: コミット**

```bash
git add apps/signage/src
git commit -m "feat(signage): add mentor-whitelist auth (auth-client, MeProvider shell, login)"
```

---

## Task 5: 時刻ソースとユーティリティ（`now` / `use-now` / `time`）

**Files:**
- Create: `apps/signage/src/lib/now.ts`
- Create: `apps/signage/src/lib/use-now.ts`
- Create: `apps/signage/src/lib/time.ts`

- [ ] **Step 1: `now.ts`（`?now=` 上書き対応の時刻ソース）**

Create `apps/signage/src/lib/now.ts`:

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

- [ ] **Step 2: `use-now.ts`（毎秒 re-render 用フック）**

Create `apps/signage/src/lib/use-now.ts`:

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

- [ ] **Step 3: `time.ts`（JST 時刻・カウントダウン整形）**

Create `apps/signage/src/lib/time.ts`:

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

- [ ] **Step 4: `use-wake-lock.ts`（スリープ防止・visibility で再取得）**

Create `apps/signage/src/lib/use-wake-lock.ts`:

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

- [ ] **Step 5: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし（`WakeLockSentinel`/`navigator.wakeLock` は lib.dom 由来）。

- [ ] **Step 6: コミット**

```bash
git add apps/signage/src/lib
git commit -m "feat(signage): add time utils (now override, useNow, jst/mmss) and wake lock hook"
```

---

## Task 6: チャイム音（Web Audio 合成）`chimes.ts`

**Files:**
- Create: `apps/signage/src/lib/chimes.ts`

- [ ] **Step 1: 実装**

Create `apps/signage/src/lib/chimes.ts`:

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

- [ ] **Step 2: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/signage/src/lib/chimes.ts
git commit -m "feat(signage): synthesize chime tones via Web Audio"
```

---

## Task 7: チャイムスケジューラ `use-chime-scheduler.ts`

**Files:**
- Create: `apps/signage/src/lib/use-chime-scheduler.ts`

- [ ] **Step 1: 実装（自己補正 setTimeout ＋ key dedup）**

Create `apps/signage/src/lib/use-chime-scheduler.ts`:

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

- [ ] **Step 2: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add apps/signage/src/lib/use-chime-scheduler.ts
git commit -m "feat(signage): drift-free chime scheduler with per-boundary dedupe"
```

---

## Task 8: ライブデータ取得 `use-signage-data.ts`

**Files:**
- Create: `apps/signage/src/lib/use-signage-data.ts`

- [ ] **Step 1: 実装（`/api/sessions/today` をポーリングしターム別に集計）**

Create `apps/signage/src/lib/use-signage-data.ts`:

```ts
'use client';

import type { TermId } from '@tecnova/shared/venue-schedule';
import type { TodaySessionsResponse } from '@tecnova/shared/schemas';
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

- [ ] **Step 2: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし（`TodaySessionsResponse` は `@tecnova/shared/schemas` からエクスポート済み）。

- [ ] **Step 3: コミット**

```bash
git add apps/signage/src/lib/use-signage-data.ts
git commit -m "feat(signage): poll /api/sessions/today and derive per-term counts"
```

---

## Task 9: 動画プレイリスト ＋ Stage（動画レイヤ）

**Files:**
- Create: `apps/signage/src/config/playlist.ts`
- Create: `apps/signage/src/components/stage.tsx`

- [ ] **Step 1: プレイリスト設定**

Create `apps/signage/src/config/playlist.ts`:

```ts
export interface VideoItem {
  src: string;
  type?: string;
}

// 動画はリポジトリに置かず、self-host/CDN の URL を列挙する。差し替えは本ファイル＋再デプロイ。
// 例（実URLに差し替える）:
//   { src: 'https://cdn.example.com/signage/intro.mp4', type: 'video/mp4' },
// 空配列のままだと Stage は背景色のみを表示する。
export const PLAYLIST: VideoItem[] = [];
```

- [ ] **Step 2: Stage（動画は常時マウント・active で再生/停止、unmuted で音声）**

Create `apps/signage/src/components/stage.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { PLAYLIST } from '@/config/playlist';

interface Props {
  active: boolean; // 活動フェーズ中のみ再生
  unmuted: boolean; // 起動タップ後に音声ON
}

export function Stage({ active, unmuted }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const indexRef = useRef(0);

  // React は muted を DOM に確実に反映しないため ref 経由で設定する。
  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = !unmuted;
  }, [unmuted]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) void v.play().catch(() => {});
    else v.pause();
  }, [active]);

  const handleEnded = (): void => {
    const v = ref.current;
    if (!v || PLAYLIST.length <= 1) return;
    indexRef.current = (indexRef.current + 1) % PLAYLIST.length;
    const next = PLAYLIST[indexRef.current];
    if (!next) return;
    v.src = next.src;
    void v.play().catch(() => {});
  };

  const first = PLAYLIST[0];

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full bg-slate-950 object-cover"
      playsInline
      autoPlay
      muted
      loop={PLAYLIST.length === 1}
      onEnded={handleEnded}
      src={first?.src}
    />
  );
}
```

- [ ] **Step 3: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add apps/signage/src/config/playlist.ts apps/signage/src/components/stage.tsx
git commit -m "feat(signage): playlist config and video stage layer"
```

---

## Task 10: 表示コンポーネント（info-bar / break-screen / idle-screen / tap-to-start）

**Files:**
- Create: `apps/signage/src/components/info-bar.tsx`
- Create: `apps/signage/src/components/break-screen.tsx`
- Create: `apps/signage/src/components/idle-screen.tsx`
- Create: `apps/signage/src/components/tap-to-start.tsx`

- [ ] **Step 1: InfoBar（活動中の上部バー）**

Create `apps/signage/src/components/info-bar.tsx`:

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

Create `apps/signage/src/components/break-screen.tsx`:

```tsx
'use client';

import { mmss } from '@/lib/time';

interface Props {
  show: boolean;
  secondsToResume: number | null;
  present: number;
}

// 動画レイヤの上に重ね、opacity でクロスフェード。動画は裏で再生継続（再読込フラッシュ防止）。
// prefers-reduced-motion 時は globals 側のトランジション無効化に委ねつつ、ここでも duration を短縮。
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

Create `apps/signage/src/components/idle-screen.tsx`:

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
        {soon
          ? 'まもなく開始'
          : nextStartAt
            ? `次は ${jstHm(nextStartAt)} から`
            : '本日は終了しました'}
      </p>
      {present > 0 && <p className="text-lg text-slate-400">在館 {present} 人</p>}
    </div>
  );
}
```

- [ ] **Step 4: TapToStart（音声解放ゲート）**

Create `apps/signage/src/components/tap-to-start.tsx`:

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
      <span className="text-base text-slate-400">音声と全画面表示を有効にします</span>
    </button>
  );
}
```

- [ ] **Step 5: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add apps/signage/src/components
git commit -m "feat(signage): info-bar, break/idle screens, tap-to-start overlay"
```

---

## Task 11: 状態機械の結線 `page.tsx`

**Files:**
- Modify: `apps/signage/src/app/page.tsx`

- [ ] **Step 1: 本体を実装（暫定プレースホルダを置き換え）**

Replace `apps/signage/src/app/page.tsx` の全内容:

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
import { Stage } from '@/components/stage';
import { TapToStart } from '@/components/tap-to-start';
import { ensureAudioRunning, playChime, resumeAudio } from '@/lib/chimes';
import { getNow } from '@/lib/now';
import { useChimeScheduler } from '@/lib/use-chime-scheduler';
import { useNow } from '@/lib/use-now';
import { useSignageData } from '@/lib/use-signage-data';
import { useWakeLock } from '@/lib/use-wake-lock';

export default function SignagePage() {
  const [started, setStarted] = useState(false);
  const now = useNow(1000);
  const data = useSignageData();
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
  // （ターム内・未稼働で算出すると次境界が break になり「次は HH:MM から」が誤表示になるため）。
  const msNext = moment.term === null ? msUntilNextBoundary(now) : null;
  const nextStartAt = msNext === null ? null : new Date(now.getTime() + msNext);

  return (
    <main className="relative h-svh w-screen overflow-hidden bg-slate-950 text-white">
      <Stage active={started && phase === 'activity'} unmuted={started} />

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

      {!started && <TapToStart onStart={handleStart} />}
    </main>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `pnpm --filter signage type-check`
Expected: エラーなし。

- [ ] **Step 3: 手動 E2E（時刻上書きで全状態を確認）**

Run: `pnpm --filter signage dev` ＋ api 起動 ＋ ログイン済み。
確認（`?now=` で擬似時刻、ローカル D1 に当日セッションを1件入れて稼働させる）:
- `http://localhost:3002/?now=2026-05-30T09:30:00` → 「タップして開始」→ 当該タームに当日チェックインがあれば activity（動画＋情報バー「休憩まで …」）。チェックインが無ければ idle で「**まもなく開始**」（「次は …から」ではない）になることを確認。
- `?now=2026-05-30T09:49:50` → 数秒後に :50 へ → break 画面にクロスフェード＋休憩チャイム。
- `?now=2026-05-30T09:59:50` → :00 で activity に戻り再開チャイム。
- `?now=2026-05-30T12:30:00` → idle（「次は 13:00 から」）。
- OS/ブラウザの reduce-motion をON → クロスフェードが瞬時切替になることを確認。
Expected: 各状態遷移とチャイムが設計通り。

- [ ] **Step 4: 全体型チェック＆Lint**

Run: `pnpm type-check`
Run: `pnpm biome check .`
Expected: いずれもエラーなし（必要なら `pnpm biome check --write .` で整形）。

- [ ] **Step 5: コミット**

```bash
git add apps/signage/src/app/page.tsx
git commit -m "feat(signage): wire phase state machine (video/break/idle + chimes)"
```

---

## Task 12: ドキュメント（アプリ docs ＋ architecture 追記）

**Files:**
- Create: `apps/signage/AGENTS.md`
- Create: `apps/signage/CLAUDE.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: `AGENTS.md`（checkin と同一）**

Create `apps/signage/AGENTS.md`:

```markdown
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
```

- [ ] **Step 2: `CLAUDE.md`**

Create `apps/signage/CLAUDE.md`:

```markdown
@AGENTS.md

# signage（会場サイネージ / 大型モニター・キオスク）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3002`（`next dev --port 3002`）。api は `8787`、checkin は `3000`、admin は `3001`。
- **認証あり**: checkin/admin と同じメンター・ホワイトリスト（`MeProvider`/`auth-client`）。運用は**テクノバ共有の管理用 Google アカウント**で1回ログイン（セッション既定7日）。`useMe` はツリー内に `MeProvider` 必須。
- **データ**: 認証付き `GET /api/sessions/today` を再利用（新規エンドポイントなし）。ターム別チェックイン数は `sessions[].term` から算出し、**現タームに当日チェックインが入った時点で稼働開始**（ターム終了まで sticky）。
- **時刻ロジック**: `@tecnova/shared/activity-cycle`（50分活動/10分休憩・チャイム時刻）。表示の時刻上書きは `?now=ISO`（手動検証用）。
- **動画**: `src/config/playlist.ts` に URL を列挙（リポジトリにバイナリを置かない）。
- **キオスク**: 横向き・フルスクリーン。起動時「タップして開始」で音声/全画面/wake lock を解放（ブラウザの自動再生制約）。本番は Chromium を `--kiosk` 等で起動。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時 `http://localhost:8787`）。API 側 `TRUSTED_ORIGINS` にサイネージ origin（dev: `http://localhost:3002`、本番ドメイン）を登録すること。
- 新しい `@tecnova/*` パッケージを使うときは `next.config.ts` の `transpilePackages` に追加。
```

- [ ] **Step 3: `docs/architecture.md` にサイネージを追記**

`docs/architecture.md` のフロントエンドアプリ一覧（`apps checkin` / `apps admin` などが並ぶ箇所）に、認証ありの新規アプリとして `apps signage`（会場サイネージ・大型モニター・メンター認証・`/api/sessions/today` 再利用・`activity-cycle` 連動）を、既存エントリと同じ記法で1行追加する。拡張ロードマップ側にも一文（サイネージ＝Phase 拡張で追加、機微コンテンツは同じ認証配下で拡張予定）を加える。

- [ ] **Step 4: Lint**

Run: `pnpm biome check .`
Expected: エラーなし。

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
4. `pnpm dev` 後、`http://localhost:3002` で：未ログイン→/login→共有アカウントでログイン→「タップして開始」→ `?now=` で activity/break/idle 遷移とチャイムを確認。
5. 実機キオスク：音付き動画・wake lock・全画面、タブ復帰で音声復帰、セッション維持（再読込でログイン不要）を確認。

## 留意点（spec §9 由来）

- 端末ローカル時計依存（NTP 同期推奨）。
- セッション既定7日（長期運用は `apps/api/src/lib/auth.ts` に `session.expiresIn` 追加で延長可）。
- 稼働判定はポーリング間隔（~20秒）分のラグあり。:50 直前の初チェックインは当該休憩チャイムを逃しうる（許容）。
- v1 は `/api/sessions/today` の PII を画面に出さない。将来の機微コンテンツは同じ認証配下の新エンドポイントで。
- 起動タップ後の動画 unmute/再生は React effect 経由（タップと同一ジェスチャ内の同期呼び出しではない）。ページの sticky activation ＋ キオスクの autoplay policy で実用上は問題なし。非キオスクの素のブラウザで初回 unmuted 再生がブロックされた場合は Stage の muted フォールバック（`play()` 失敗を握る）に依存する。より厳密にするなら handleStart 内で video へ imperative に `muted=false; play()` してから `setStarted(true)` する。
```

