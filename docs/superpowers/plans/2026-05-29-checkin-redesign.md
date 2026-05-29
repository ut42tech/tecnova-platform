# checkin リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロフィール画面の motion + Cohesive Elevation 語彙を `apps/checkin` の残り 7 画面へ統一展開し、各高インパクト画面に 1 つのシグネチャーモーメントを与える。

**Architecture:** 先に再利用プリミティブ（motion 定数 / `Reveal` / `StatTile` / `LiveDot` / `PageShell`）を `apps/checkin/src/components` と `src/lib` に用意し、Home を実機ディレクションスライスとして組んで承認を取る。承認後、確定した語彙を残り 6 画面へ展開し、デザイン整合性の敵対的レビューを通す。視覚回帰防止のためプロフィール画面と `AppShell` は触らない。

**Tech Stack:** Next.js 16 (App Router) / React 19 / `motion`（`motion/react`）/ Tailwind v4 / shadcn(`@tecnova/ui`) / `@tabler/icons-react` / Biome / TypeScript strict。

**設計書:** `docs/superpowers/specs/2026-05-29-checkin-redesign-design.md`

**検証パターン（全タスク共通）:**
- 型: `pnpm type-check`
- Lint/format: `pnpm biome check --write apps/checkin`
- 目視: `pnpm --filter checkin dev` → 該当画面 + reduced-motion（OS 設定 ON）を確認

**重要な制約:**
- App Router API を触る箇所（`useSearchParams` / `Suspense` / metadata 等）は実装前に `node_modules/next/dist/docs/` を確認（`apps/checkin/AGENTS.md`）。
- モーションは必ず `useReducedMotion()` でゲート。transform/opacity のみ。
- プロフィール画面 `src/app/reception/participants/[id]/page.tsx` と `src/components/app-shell.tsx` は変更しない。

---

## ファイル構成（新規 / 変更）

**新規（プリミティブ）**
- `apps/checkin/src/lib/motion.ts` — モーション定数・transition ファクトリ
- `apps/checkin/src/components/reveal.tsx` — フェードアップ入場ラッパ
- `apps/checkin/src/components/stat-tile.tsx` — 数値タイル
- `apps/checkin/src/components/live-dot.tsx` — 脈動プレゼンスドット
- `apps/checkin/src/components/page-shell.tsx` — グラデーション地 `<main>`

**新規（画面固有シグネチャー）**
- `apps/checkin/src/components/scan-reticle.tsx` — Home の QR スキャン演出
- `apps/checkin/src/components/segmented-control.tsx` — Manual のモード切替

**変更（7 画面）**
- `src/app/page.tsx`（Home）/ `login/page.tsx` / `manual/page.tsx` / `first-time/page.tsx` / `guideline/page.tsx` / `history/page.tsx` / `settings/page.tsx`

---

## Phase 0 — 準備

### Task 0: フィーチャーブランチ作成

- [ ] **Step 1: develop から作業ブランチを切る**

```bash
git checkout develop
git pull --ff-only
git checkout -b feat/checkin-redesign
```

- [ ] **Step 2: 起点を確認**

Run: `git status && git log --oneline -1`
Expected: クリーン、`develop` 先端から分岐。

---

## Phase 1 — 共有プリミティブ

### Task 1: モーション定数モジュール

**Files:**
- Create: `apps/checkin/src/lib/motion.ts`

- [ ] **Step 1: 定数とファクトリを実装**

```ts
import type { Transition } from 'motion/react';

// 入場・小要素演出のイージングは全画面でこの値に統一する（プロフィール画面と同値）。
const EASE_OUT = 'easeOut' as const;

// セクション/カードのフェードアップ入場。
export const revealInitial = { opacity: 0, y: 12 } as const;
export const revealAnimate = { opacity: 1, y: 0 } as const;
export const REVEAL_STAGGER_STEP = 0.06;
export const revealTransition = (index = 0): Transition => ({
  duration: 0.4,
  ease: EASE_OUT,
  delay: index * REVEAL_STAGGER_STEP,
});

// 主要ボタンの押下フィードバック。
export const tapScale = { scale: 0.97 } as const;

// タイル/小要素のポップ（来場ヒートマップと同値）。スタッガーは間延びしないよう頭打ち。
export const popInitial = { opacity: 0, scale: 0.6 } as const;
export const popAnimate = { opacity: 1, scale: 1 } as const;
export const POP_STAGGER_STEP = 0.012;
export const POP_STAGGER_MAX = 0.5;
export const popTransition = (index = 0): Transition => ({
  duration: 0.25,
  ease: EASE_OUT,
  delay: Math.min(index * POP_STAGGER_STEP, POP_STAGGER_MAX),
});

// 検索結果・候補・履歴行など、行数が多いリスト向けの大きめスタッガー。
export const LIST_STAGGER_STEP = 0.04;
export const LIST_STAGGER_MAX = 0.4;
export const listItemTransition = (index = 0): Transition => ({
  duration: 0.3,
  ease: EASE_OUT,
  delay: Math.min(index * LIST_STAGGER_STEP, LIST_STAGGER_MAX),
});
```

- [ ] **Step 2: 型チェック**

Run: `pnpm type-check`
Expected: PASS（エラーなし）。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/lib/motion.ts
git commit -m "feat(checkin): add shared motion constants"
```

### Task 2: Reveal コンポーネント

**Files:**
- Create: `apps/checkin/src/components/reveal.tsx`

- [ ] **Step 1: 実装**

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { revealAnimate, revealInitial, revealTransition } from '@/lib/motion';

// 子をフェードアップで入場させる薄いラッパ。index でスタッガーをずらす。
// prefers-reduced-motion 時は initial を無効化して即表示する。
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={prefersReduced ? false : revealInitial}
      animate={revealAnimate}
      transition={revealTransition(index)}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/components/reveal.tsx`
Expected: PASS。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/components/reveal.tsx
git commit -m "feat(checkin): add Reveal entrance wrapper"
```

### Task 3: StatTile コンポーネント

**Files:**
- Create: `apps/checkin/src/components/stat-tile.tsx`

- [ ] **Step 1: 実装**

```tsx
import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';

type StatTone = 'neutral' | 'emerald';

// 集計値タイル。value は ReactNode（AnimatedNumber + 単位サフィックス等）を想定。
export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  const isEmerald = tone === 'emerald';
  return (
    <div
      className={cn(
        'rounded-lg p-4',
        isEmerald ? 'border border-emerald-200 bg-emerald-50' : 'border bg-white',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-bold',
          isEmerald ? 'text-emerald-700' : 'text-muted-foreground',
        )}
      >
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-2 break-words text-4xl font-black leading-tight tabular-nums',
          isEmerald && 'text-emerald-700',
        )}
      >
        {value}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/components/stat-tile.tsx`
Expected: PASS。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/components/stat-tile.tsx
git commit -m "feat(checkin): add StatTile component"
```

### Task 4: LiveDot コンポーネント

**Files:**
- Create: `apps/checkin/src/components/live-dot.tsx`

- [ ] **Step 1: 実装**

```tsx
'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';

// 滞在中=emerald の脈動、未滞在=slate の静止。プロフィール画面の在席ドットと同じ演出。
export function LiveDot({ active, className }: { active: boolean; className?: string }) {
  const prefersReduced = useReducedMotion();

  if (!active) {
    return (
      <span className={cn('size-2.5 rounded-full bg-slate-400', className)} aria-hidden="true" />
    );
  }

  return (
    <motion.span
      className={cn('size-2.5 rounded-full bg-emerald-500', className)}
      animate={prefersReduced ? undefined : { scale: [1, 1.35, 1], opacity: [1, 0.5, 1] }}
      transition={
        prefersReduced
          ? undefined
          : { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
      }
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/components/live-dot.tsx`
Expected: PASS。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/components/live-dot.tsx
git commit -m "feat(checkin): add LiveDot presence indicator"
```

### Task 5: PageShell コンポーネント

**Files:**
- Create: `apps/checkin/src/components/page-shell.tsx`

- [ ] **Step 1: 実装**

```tsx
import { cn } from '@tecnova/ui/lib/utils';
import type { ReactNode } from 'react';

// 全画面共通のグラデーション地。中央寄せ等は className で上書きする。
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        'flex flex-1 flex-col bg-gradient-to-b from-sky-50 to-white p-4 sm:p-6',
        className,
      )}
    >
      {children}
    </main>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/components/page-shell.tsx`
Expected: PASS。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/components/page-shell.tsx
git commit -m "feat(checkin): add PageShell gradient ground"
```

---

## Phase 2 — Home ディレクションスライス（承認ゲート）

### Task 6: ScanReticle コンポーネント

**Files:**
- Create: `apps/checkin/src/components/scan-reticle.tsx`

- [ ] **Step 1: 実装**

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';

// 映像枠に重ねる QR スキャン演出。角ブラケット + 上下に走る走査線。
// pointer-events-none で下のビデオ操作を妨げない。reduced 時は走査線を止めブラケットのみ。
const CORNER_CLASSES = [
  'left-0 top-0 rounded-tl-xl border-l-4 border-t-4',
  'right-0 top-0 rounded-tr-xl border-r-4 border-t-4',
  'left-0 bottom-0 rounded-bl-xl border-b-4 border-l-4',
  'right-0 bottom-0 rounded-br-xl border-b-4 border-r-4',
] as const;

export function ScanReticle() {
  const prefersReduced = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 sm:p-10">
      <div className="relative aspect-square h-full max-h-[72%] max-w-[72%]">
        {CORNER_CLASSES.map((pos) => (
          <span key={pos} className={`absolute size-10 border-white/90 ${pos}`} aria-hidden="true" />
        ))}
        {!prefersReduced && (
          <motion.span
            className="absolute inset-x-2 h-0.5 rounded-full bg-sky-300/90 shadow-[0_0_12px_2px_rgba(125,211,252,0.7)]"
            initial={{ top: '6%' }}
            animate={{ top: ['6%', '94%', '6%'] }}
            transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/components/scan-reticle.tsx`
Expected: PASS。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/components/scan-reticle.tsx
git commit -m "feat(checkin): add ScanReticle QR overlay"
```

### Task 7: Home 画面の再構成

**Files:**
- Modify: `apps/checkin/src/app/page.tsx`

- [ ] **Step 1: import を更新**

`@tabler/icons-react` の import から `IconBug` を削除し `IconKeyboard` を追加。あわせて新規コンポーネントを import。

変更後の import 群（先頭付近）:

```tsx
import {
  IconArrowRight,
  IconCamera,
  IconCameraRotate,
  IconClipboardCheck,
  IconKeyboard,
  IconQrcode,
  IconRefresh,
  IconUserPlus,
} from '@tabler/icons-react';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardDescription } from '@tecnova/ui/components/card';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { PanelHeader, type PanelTone } from '@/components/panel-header';
import { Reveal } from '@/components/reveal';
import { ScanReticle } from '@/components/scan-reticle';
import { PARTICIPANT_ID_PATTERN, participantProfilePath } from '@/lib/participant-id';
```

- [ ] **Step 2: `<main>` を PageShell に置換し、レイアウトを Reveal で包む**

`return (` 内の最上位 `<main className="flex flex-1 flex-col bg-sky-50 p-4">` を次へ置換（グラデーション地化）。`<section>` 内の QR カードと右側アクション列をそれぞれ `Reveal` でラップしてスタッガー入場させる。

QR カード（左）: `Reveal index={0}` で包む。アクション列（右の `<div class="grid h-full ...">`）の **各 `ActionPanel` を個別に `Reveal` で包む**（index=1,2,3）と段階的に出る。`ActionPanel` 自身を `Reveal` でラップする形にする：

```tsx
return (
  <PageShell>
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <section className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
        <Reveal index={0} className="flex">
          <Card className="flex h-full w-full flex-col border-sky-200 shadow-sm">
            <PanelHeader
              icon={<IconQrcode className="size-8" />}
              title="QRコードをかざしてね"
              tone="sky"
            />
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="relative min-h-72 w-full flex-1 overflow-hidden rounded-lg bg-slate-950 lg:h-[clamp(280px,calc(100svh-340px),560px)] lg:flex-none">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                {!navigatingId && !cameraError && <ScanReticle />}
                {navigatingId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-6 text-center text-white">
                    <IconQrcode className="size-12" aria-hidden="true" />
                    <p className="text-2xl font-black">プロフィールを開いています</p>
                    <p className="text-4xl font-black tracking-widest tabular-nums">
                      {navigatingId}
                    </p>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 p-6 text-center text-lg font-bold text-white">
                    <IconCamera className="mr-3 size-8" aria-hidden="true" />
                    カメラを起動できませんでした
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 text-base"
                  disabled={navigatingId !== null}
                  onClick={() => setScannerAttempt((attempt) => attempt + 1)}
                >
                  <IconRefresh className="size-5" data-icon="inline-start" />
                  カメラを再起動
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 text-base"
                  disabled={navigatingId !== null}
                  onClick={() => void switchCamera()}
                >
                  <IconCameraRotate className="size-5" data-icon="inline-start" />
                  カメラ切り替え
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <div className="grid h-full gap-2 sm:grid-cols-3 lg:grid-cols-1 lg:grid-rows-3">
          <ActionPanel
            index={1}
            title="初めての人"
            description="IDカードがない人はこちら。"
            icon={<IconUserPlus className="size-8" />}
            tone="emerald"
            href="/first-time"
            action="初回登録へ"
          />
          <ActionPanel
            index={2}
            title="受付りれき"
            description="今日の受付状況を確認します。"
            icon={<IconClipboardCheck className="size-8" />}
            tone="sky"
            href="/history"
            action="履歴を見る"
          />
          <ActionPanel
            index={3}
            title="マニュアル入力"
            description="QRコードが読めないときはこちら。"
            icon={<IconKeyboard className="size-8" />}
            tone="slate"
            href="/manual"
            action="入力へ"
            buttonVariant="outline"
          />
        </div>
      </section>
    </div>
  </PageShell>
);
```

- [ ] **Step 3: `ActionPanel` に `index` を追加し Reveal で包む**

`ActionPanel` の props 型に `index: number;` を追加し、返り値を `Reveal` でラップ：

```tsx
function ActionPanel({
  index,
  title,
  description,
  icon,
  tone,
  href,
  action,
  buttonVariant = 'default',
}: {
  index: number;
  title: string;
  description: string;
  icon: ReactNode;
  tone: PanelTone;
  href: string;
  action: string;
  buttonVariant?: 'default' | 'outline';
}) {
  return (
    <Reveal index={index} className="flex">
      <Card size="sm" className="flex h-full w-full flex-col gap-2 py-4 shadow-sm">
        <PanelHeader icon={icon} title={title} tone={tone} />
        <CardContent className="flex flex-1 flex-col gap-2">
          <CardDescription className="text-sm leading-relaxed text-foreground lg:text-base">
            {description}
          </CardDescription>
          <div className="flex-1" />
          <Button asChild variant={buttonVariant} size="lg" className="h-11 w-full text-base">
            <Link href={href}>
              {action}
              <IconArrowRight className="size-5" data-icon="inline-end" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </Reveal>
  );
}
```

- [ ] **Step 4: 型チェック + lint**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/page.tsx`
Expected: PASS。`IconBug` の未使用警告が消えていること。

- [ ] **Step 5: 目視確認**

Run: `pnpm --filter checkin dev` → `http://localhost:3000/`
確認: グラデーション地、QR カード→アクションカードのスタッガー入場、走査線アニメ、`IconKeyboard` 表示。OS の reduced-motion ON で走査線停止・即表示。

- [ ] **Step 6: commit**

```bash
git add apps/checkin/src/app/page.tsx
git commit -m "feat(checkin): elevate home screen with motion and scan reticle"
```

### 🚦 承認ゲート

> **STOP.** Home をユーザーが実機で確認し、見た目・モーション感・走査線の強さを承認するまで Phase 3 に進まない。
> フィードバックがあれば該当プリミティブ／Home を調整し、確定した語彙を Phase 3 の基準とする。

---

## Phase 3 — 残り 6 画面への展開

> 各画面共通の「基本変換」: ①`<main className="...bg-sky-50...">` を `PageShell`（中央寄せ画面は `className` で `items-center justify-center` を付与）に置換 ②ルート直下のカード／セクションを `Reveal`（index でスタッガー）で包む ③主要送信ボタンを `motion.div`+`whileTap={tapScale}` でラップ（プロフィール画面と同じ手法）。Loading/Error 画面も地をグラデーションへ統一（Error は `bg-rose-50` 維持）。
> 各タスクは基本変換 + そのシグネチャー実装 + 検証 + commit。

### Task 8: Guideline（ショーケース）

**Files:**
- Modify: `apps/checkin/src/app/guideline/page.tsx`

- [ ] **Step 1: 基本変換**

`GuidelineSlideView` / `LoadingScreen` / `ActivatingScreen` の `<main ... bg-sky-50 ...>` を `PageShell`（`p-3 sm:p-4` を保つため `className="p-3 sm:p-4"` を渡す）に置換。`ErrorScreen` は `bg-rose-50` のまま。

- [ ] **Step 2: シグネチャー① 方向付きスライド遷移**

`slideIndex` の増減方向を保持する state を追加し、スライド本体（`<section class="grid min-h-[300px] ...">` のビジュアル+本文）を `AnimatePresence` + `motion.div` で包む。`useReducedMotion` 時は x 移動を 0 にしてクロスフェードのみ。

`GuidelinePageContent` に方向 state を追加：

```tsx
const [direction, setDirection] = useState(1);
const goPrev = () => {
  setDirection(-1);
  setSlideIndex((index) => Math.max(0, index - 1));
};
const goNext = () => {
  setDirection(1);
  setSlideIndex((index) => Math.min(GUIDELINE_SLIDES.length - 1, index + 1));
};
```

`GuidelineSlideView` の props を `onPrev: goPrev` / `onNext: goNext` に差し替え、`current`（=`slideIndex+1`）と `direction` を渡す。スライド本体を次でラップ（`import { AnimatePresence, motion, useReducedMotion } from 'motion/react';`）：

```tsx
const prefersReduced = useReducedMotion();
const offset = prefersReduced ? 0 : 40;
// ...
<div className="relative">
  <AnimatePresence mode="wait" custom={direction}>
    <motion.section
      key={current}
      custom={direction}
      initial={{ opacity: 0, x: direction * offset }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: direction * -offset }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="grid min-h-[300px] items-stretch gap-3 lg:grid-cols-[260px_minmax(0,1fr)]"
    >
      {/* 既存のビジュアルパネル + 本文パネルをそのまま内側へ */}
    </motion.section>
  </AnimatePresence>
</div>
```

- [ ] **Step 3: シグネチャー② 進捗バーの幅アニメーション**

進捗バーの内側 `<div>` を `motion.div` 化し幅をアニメート：

```tsx
<div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
  <motion.div
    className={cn('h-full rounded-full', tone.progress)}
    initial={false}
    animate={{ width: progress }}
    transition={prefersReduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
  />
</div>
```

- [ ] **Step 4: シグネチャー③ アイコンのポップ入場 + キーボード操作**

ビジュアルパネルのアイコン円を `motion.div` にし、`popInitial`/`popAnimate`/`popTransition(0)` を適用（`@/lib/motion` から import、reduced 時は `initial={false}`）。
`GuidelineSlideView` に矢印キー操作を追加：

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !isLast) onNext();
    if (e.key === 'ArrowLeft' && current > 1) onPrev();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [current, isLast, onNext, onPrev]);
```

- [ ] **Step 5: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/guideline/page.tsx`
目視: `/guideline?preRegistrationId=<existing>` で 前/次 のスライド方向、進捗バーの伸び、アイコンのポップ、←/→ キー、reduced-motion 即時化。

- [ ] **Step 6: commit**

```bash
git add apps/checkin/src/app/guideline/page.tsx
git commit -m "feat(checkin): elevate guideline carousel with slide transitions"
```

### Task 9: Login（ウェルカムヒーロー）

**Files:**
- Modify: `apps/checkin/src/app/login/page.tsx`

- [ ] **Step 1: 基本変換 + ヒーロー化**

`<main ... bg-sky-50 ...>` を `PageShell`（`className="items-center justify-center"`）へ。カードを `Reveal` で包む。カード上部に TECNOVA ロゴ + やさしい見出しのヒーローを追加（装飾背景なし、フラット）。Google ボタンを `motion.div`+`whileTap={tapScale}` で包む。

```tsx
import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { Button } from '@tecnova/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@tecnova/ui/components/card';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { Reveal } from '@/components/reveal';
import { tapScale } from '@/lib/motion';
import { authClient } from '@/lib/auth-client';
// signIn は既存実装のまま

const prefersReduced = useReducedMotion();
return (
  <PageShell className="items-center justify-center">
    <Reveal className="w-full max-w-md">
      <Card className="w-full border-sky-200 shadow-sm">
        <CardHeader className="items-center gap-4 text-center">
          <Image src="/logo_tecnova.png" alt="TECNOVA" width={180} height={47} priority className="h-12 w-auto" />
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-3xl">ようこそ</CardTitle>
            <p className="text-base font-bold text-muted-foreground">
              うけつけシステムにサインインしてください
            </p>
          </div>
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
          <motion.div className="w-full" whileTap={prefersReduced ? undefined : tapScale}>
            <Button type="button" size="lg" onClick={signIn} disabled={busy} className="h-14 w-full text-lg">
              <IconBrandGoogleFilled data-icon="inline-start" />
              {busy ? 'リダイレクト中...' : 'Google でログイン'}
            </Button>
          </motion.div>
          <p className="text-center text-sm font-bold text-muted-foreground">
            許可リストに登録されたメンターのみ利用できます
          </p>
        </CardFooter>
      </Card>
    </Reveal>
  </PageShell>
);
```

> 注: `useReducedMotion`/`prefersReduced` は `LoginPage` 関数本体の先頭で取得する。

- [ ] **Step 2: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/login/page.tsx`
目視: `/login` でロゴ + 見出し + カード入場、ボタン押下感。reduced-motion 即時化。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/app/login/page.tsx
git commit -m "feat(checkin): add welcoming hero to login screen"
```

### Task 10: Manual（モード切替の作り込み）

**Files:**
- Create: `apps/checkin/src/components/segmented-control.tsx`
- Modify: `apps/checkin/src/app/manual/page.tsx`

- [ ] **Step 1: SegmentedControl を作成**

```tsx
'use client';

import { cn } from '@tecnova/ui/lib/utils';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

type SegmentedOption<T extends string> = { value: T; label: string; icon?: ReactNode };

// 2 値以上のモード切替。選択中インジケータが layoutId でスライドする。reduced 時は即切替。
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow-sm"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex h-14 items-center justify-center gap-2 rounded-xl text-lg font-bold transition-colors',
              active ? 'text-primary-foreground' : 'text-foreground hover:bg-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId="segmented-active"
                className="absolute inset-0 rounded-xl bg-primary"
                transition={
                  prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }
                }
                aria-hidden="true"
              />
            )}
            <span className="relative flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Manual の基本変換 + ModeToggle 置換**

`<main ... bg-sky-50 ...>` を `PageShell` に。`ModeToggle`/`ToggleButton` を削除し `SegmentedControl` を使用。`IdEntryPanel`/`NameSearchPanel` の切替を `AnimatePresence`+`motion.div`（`key={mode}`、フェード+わずかな y）で包む。`IdEntryPanel` の `IconBug` を `IconKeyboard` に変更。

`ManualPage`:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { IconKeyboard, IconSearch /* ほか既存 */ } from '@tabler/icons-react';
import { PageShell } from '@/components/page-shell';
import { SegmentedControl } from '@/components/segmented-control';

export default function ManualPage() {
  const [mode, setMode] = useState<Mode>('id');
  const prefersReduced = useReducedMotion();
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <SegmentedControl
          ariaLabel="入力方法"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'id', label: 'IDで入力', icon: <IconKeyboard className="size-6" /> },
            { value: 'name', label: '名前で探す', icon: <IconSearch className="size-6" /> },
          ]}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={prefersReduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {mode === 'id' ? <IdEntryPanel /> : <NameSearchPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
  );
}
```

`IdEntryPanel` 内: `PanelHeader icon={<IconBug .../>}` を `icon={<IconKeyboard className="size-8" />}` に変更。

- [ ] **Step 3: シグネチャー 検索結果のスタッガー**

`SearchResults` の結果 `<ul>` 内 `<li>` を `motion.li`（`listItemTransition(index)`、reduced 時 `initial={false}`）に変更。`import { listItemTransition } from '@/lib/motion';`。

```tsx
{state.results.map((participant, index) => (
  <motion.li
    key={participant.id}
    initial={prefersReduced ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={listItemTransition(index)}
  >
    {/* 既存 ResultRow */}
  </motion.li>
))}
```

> `SearchResults` 内で `const prefersReduced = useReducedMotion();` を先頭に追加。

- [ ] **Step 4: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/manual/page.tsx apps/checkin/src/components/segmented-control.tsx`
目視: `/manual` でトグルのスライド、パネルのクロスフェード、検索結果のスタッガー、`IconKeyboard` 表示。reduced-motion 即時化。

- [ ] **Step 5: commit**

```bash
git add apps/checkin/src/app/manual/page.tsx apps/checkin/src/components/segmented-control.tsx
git commit -m "feat(checkin): add sliding segmented control and result stagger to manual"
```

### Task 11: History（生きているダッシュボード）

**Files:**
- Modify: `apps/checkin/src/app/history/page.tsx`

- [ ] **Step 1: 基本変換**

`<main ... bg-sky-50 ...>`（本体・LoadingScreen）を `PageShell` に。`ErrorScreen` は `bg-rose-50` 維持。本体の 2 枚のカードを `Reveal`（index 0,1）で包む。

- [ ] **Step 2: シグネチャー サマリ + LiveDot + StatTile**

サマリ 3 枚を `StatTile` に置換し数値を `AnimatedNumber` 化、「滞在中」は emerald トーン + `LiveDot active`。

```tsx
import { AnimatedNumber } from '@/components/animated-number';
import { LiveDot } from '@/components/live-dot';
import { StatTile } from '@/components/stat-tile';

<div className="grid gap-3 sm:grid-cols-3">
  <StatTile
    label="今日の受付"
    value={<><AnimatedNumber value={summary.totalCheckedIn} /><span className="ml-1 text-2xl">人</span></>}
  />
  <StatTile
    tone="emerald"
    label={<span className="flex items-center gap-2"><LiveDot active={summary.currentlyPresent > 0} />滞在中</span>}
    value={<><AnimatedNumber value={summary.currentlyPresent} /><span className="ml-1 text-2xl">人</span></>}
  />
  <StatTile
    label="退室済み"
    value={<><AnimatedNumber value={summary.checkedOut} /><span className="ml-1 text-2xl">人</span></>}
  />
</div>
```

- [ ] **Step 3: シグネチャー 行のスタッガー入場**

テーブルの `<TableBody>` 内 `filteredSessions.map` の各 `<TableRow>` を `motion.tr` 化（`@tecnova/ui` の `TableRow` は `<tr>` レンダリングのため `asChild` 不可。`motion.tr` を直接使い、`TableCell` は維持）。reduced 時 `initial={false}`、`listItemTransition(index)`。

```tsx
{filteredSessions.map((session, index) => {
  const stayDurationMinutes = getSessionStayDurationMinutes(session, nowMs);
  return (
    <motion.tr
      key={session.sessionId}
      className="border-b transition-colors hover:bg-muted/50"
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listItemTransition(index)}
    >
      {/* 既存の TableCell 群をそのまま */}
    </motion.tr>
  );
})}
```

> `HistoryPage` 先頭で `const prefersReduced = useReducedMotion();` を取得。`motion`/`useReducedMotion`/`listItemTransition` を import。`motion.tr` の className はテーブル行のスタイルを `@tecnova/ui` の `TableRow` 実装に合わせる（`node_modules/@tecnova/ui` または生成元の table.tsx を確認して border/hover クラスを移植）。

- [ ] **Step 4: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/history/page.tsx`
目視: `/history` でサマリのカウントアップ、滞在中の脈動ドット、行のスタッガー、空状態。reduced-motion 即時化。

- [ ] **Step 5: commit**

```bash
git add apps/checkin/src/app/history/page.tsx
git commit -m "feat(checkin): animate history summary and rows"
```

### Task 12: First-time（ステップ + 候補のスタッガー）

**Files:**
- Modify: `apps/checkin/src/app/first-time/page.tsx`

- [ ] **Step 1: 基本変換**

本体・LoadingScreen の `<main ... bg-sky-50 ...>` を `PageShell` に。`ErrorScreen` は `bg-rose-50` 維持。メインカードを `Reveal` で包む。

- [ ] **Step 2: シグネチャー 件数バッジ + ステップ + 候補グリッド**

未登録件数を `AnimatedNumber` 化：

```tsx
<Badge variant="secondary" style={{ height: 'auto' }} className="w-fit px-4 py-2 text-base">
  未登録 <AnimatedNumber value={state.items.length} className="mx-1 tabular-nums" />人
</Badge>
```

`RegistrationSteps` の各 `<li>` と、候補 `<ul className="grid ...">` の各 `<li>` を `motion.li`（`listItemTransition(index)`、reduced 時 `initial={false}`）化。`FirstTimePage`/`RegistrationSteps` 先頭で `useReducedMotion()` 取得、`@/lib/motion` と `@/components/animated-number` を import。

- [ ] **Step 3: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/first-time/page.tsx`
目視: `/first-time` で件数カウントアップ、ステップ/候補のスタッガー、ダイアログ動作維持。reduced-motion 即時化。

- [ ] **Step 4: commit**

```bash
git add apps/checkin/src/app/first-time/page.tsx
git commit -m "feat(checkin): stagger first-time steps and candidate grid"
```

### Task 13: Settings（メンター ID カード）

**Files:**
- Modify: `apps/checkin/src/app/settings/page.tsx`

- [ ] **Step 1: 基本変換 + ヘッダのアイデンティティカード化**

`<main ... bg-sky-50 ...>` を `PageShell` に。カードを `Reveal` で包む。`CardHeader` の素の歯車を、メンターのアバター（頭文字 or `IconUser`）+ 名前 + ロールバッジのヘッダに差し替え：

```tsx
<CardHeader className="gap-3">
  <div className="flex items-center gap-4">
    <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sky-100 text-2xl font-black text-sky-700">
      {me.mentor.name.slice(0, 1)}
    </div>
    <div className="min-w-0">
      <CardTitle className="break-words text-2xl">{me.mentor.name}</CardTitle>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{me.mentor.role}</Badge>
        <span className="truncate text-sm font-bold text-muted-foreground">{me.user.email}</span>
      </div>
    </div>
  </div>
</CardHeader>
```

> 既存の情報テーブル（`rows`）とログアウトダイアログはそのまま残す。`IconSettings` import が未使用になれば削除。

- [ ] **Step 2: 検証**

Run: `pnpm type-check && pnpm biome check --write apps/checkin/src/app/settings/page.tsx`
目視: `/settings` でアイデンティティカード、入場モーション、ログアウト動作維持。

- [ ] **Step 3: commit**

```bash
git add apps/checkin/src/app/settings/page.tsx
git commit -m "feat(checkin): add mentor identity header to settings"
```

---

## Phase 4 — 整合性レビューと最終検証

### Task 14: デザイン整合性の敵対的レビュー

- [ ] **Step 1: 並列レビューをディスパッチ**

ultracode 方針: Workflow で画面横断のレビュアーを並列起動し、各画面が「Home で確定した語彙」に一致しているかを照合（地のグラデーション、`border-sky-200 shadow-sm`、Reveal スタッガーの index 連番、reduced-motion ゲートの抜け、トーン整合、タッチサイズ）。各指摘を別エージェントで真偽判定し、確定分のみ修正。

- [ ] **Step 2: 指摘を反映してコミット**

```bash
git add -A && git commit -m "fix(checkin): resolve design-consistency review findings"
```

### Task 15: 最終検証 + PR

- [ ] **Step 1: 全体検証**

```bash
pnpm type-check
pnpm biome check apps/checkin
pnpm --filter checkin build
```
Expected: すべて PASS。

- [ ] **Step 2: 回帰確認**

`pnpm --filter checkin dev` で プロフィール画面 `/reception/participants/<id>` と全画面共通ヘッダに視覚回帰が無いことを確認（地・カード・モーションが従来どおり）。

- [ ] **Step 3: PR 作成（ユーザー承認後）**

```bash
git push -u origin feat/checkin-redesign
gh pr create --base develop --title "feat(checkin): redesign all screens except profile" --body "<本プラン要約 + スクショ>"
```

---

## Self-Review（記入済み）

- **Spec coverage:** §4 プリミティブ → Task1-5/6/10。§5 モーション契約 → Task1。§6 各画面 → Home Task7 / Guideline Task8 / Login Task9 / Manual Task10 / History Task11 / First-time Task12 / Settings Task13。§7 回帰防止 → Task15 Step2 + 全タスクでプロフィール/シェル不変更。§10 検証 → 各タスク検証 + Task15。網羅。
- **Placeholder scan:** TBD/TODO 無し。各コード手順に実コードを記載。Task11 の `motion.tr` のみ `@tecnova/ui` table.tsx の border/hover クラス移植を要確認と明記（プレースホルダではなく確認指示）。
- **Type consistency:** `Reveal({index,className,children})`、`StatTile({label,value,icon,tone,className})`、`LiveDot({active,className})`、`PageShell({children,className})`、`SegmentedControl<T>({options,value,onChange,ariaLabel})`、`motion.ts` の `revealTransition/popTransition/listItemTransition/tapScale` — 利用箇所と一致。
