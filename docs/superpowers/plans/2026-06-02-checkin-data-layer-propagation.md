# checkin Data-Layer Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate checkin's 5 hand-rolled GET fetch state machines to the shared `useApiResource` hook and consolidate its 4 full-screen error copies into one checkin-local `CheckinErrorScreen`, while adding a backward-compatible background (stale-while-revalidate) reload to the shared hook.

**Architecture:** `packages/ui`'s read-only `useApiResource` becomes the single fetch primitive for checkin's read GETs. A new `reload({ background: true })` mode keeps current data visible during refetch (no skeleton flash) — used by checkin's history 更新 button and applied to admin's refresh/mutation refetch buttons. Presentation stays checkin-local: a new `CheckinErrorScreen` owns the full-screen kiosk error layout; loading skeletons and empty states stay page-local and unchanged. Auth, endpoints, debounce, motion, and display text are untouched. signage is out of scope (polling architecture).

**Tech Stack:** Next.js 16 / React 19, TypeScript (strict), Biome, `@tecnova/ui` shared package (`useApiResource`, `apiJson`/`apiErrorMessage`), motion/react, Tabler icons, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-02-checkin-data-layer-propagation-design.md`

**Branch:** `refactor/checkin-data-layer` (already created off `develop` @ `39d969b`, which includes `useApiResource` via #43). Single PR back to `develop` — **not stacked**.

---

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `packages/ui/src/hooks/use-api-resource.ts` | Shared read-only fetch hook | Add `reload({ background })` (SWR) — backward compatible |
| `apps/checkin/src/components/screen-error.tsx` | checkin full-screen kiosk error layout | **Create** |
| `apps/checkin/src/app/first-time/page.tsx` | Pre-registered list for initial registration | Migrate GET |
| `apps/checkin/src/app/history/page.tsx` | Today's check-in/out history | Migrate GET (background 更新) |
| `apps/checkin/src/app/reception/participants/[id]/page.tsx` | Participant profile + attendance | Migrate GET, split POST state |
| `apps/checkin/src/app/manual/page.tsx` | Debounced name search | Migrate GET, drop AbortController |
| `apps/checkin/src/app/guideline/page.tsx` | Guideline flow + activate | Migrate GET, derive item |
| `apps/admin/src/app/(authed)/page.tsx` | Dashboard | 更新 button → background reload |
| `apps/admin/src/app/(authed)/mentors/page.tsx` | Mentors admin | post-mutation reload → background |
| `apps/admin/src/app/(authed)/pre-registrations/page.tsx` | Pre-reg admin | post-mutation reload → background |

**Conventions (all tasks):** call `useApiResource` unconditionally (hooks rule); gate with `enabled`. Drop any `cache: 'no-store'` from migrated GETs (API sends no cache headers; the hook revalidates). Keep all POST/mutation logic and state. Only **full-screen** error blocks move to `CheckinErrorScreen`; inline Alerts stay. Keep skeletons, empty states, motion, and Japanese text byte-for-byte. Verified import paths: hook = `@tecnova/ui/hooks/use-api-resource`; local components = `@/components/...`.

---

### Task 1: Add background (stale-while-revalidate) reload to `useApiResource`

**Files:**
- Modify: `packages/ui/src/hooks/use-api-resource.ts`

- [ ] **Step 1: Replace the hook file body**

The only changes vs. the current file: add `useRef` to the React import, add a `ReloadOptions` type, widen `reload`'s signature, and skip the `loading` flip when a background reload is requested and data is already present. Write the full file:

```ts
'use client';

import { apiErrorMessage, apiJson } from '@tecnova/ui/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

// 取得状態。idle = まだ取得していない（path=null / enabled=false）。
export type ResourceState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

export interface ReloadOptions {
  // true のとき、既にデータがある場合は loading に戻さず裏で再取得する
  // （stale-while-revalidate）。更新ボタンのちらつき回避用。初回取得・path 変更は
  // 従来どおり loading を表示する。
  background?: boolean;
}

export interface UseApiResourceResult<T> {
  state: ResourceState<T>;
  reload: (opts?: ReloadOptions) => void;
}

export interface UseApiResourceOptions {
  // false のあいだは取得せず idle のままにする（ロール待ち等の条件付き取得用）。
  enabled?: boolean;
}

// path から JSON を取得し loading|ok|error|idle を返す読み取り専用フック。
// - path が null か enabled=false のとき idle（取得しない）。
// - path が変わると自動で再取得する（クエリ文字列を path に含めて表現する）。
// - reload() で手動再取得。reload({ background: true }) は表示中のデータを
//   保持したまま裏で再取得する（ちらつき回避）。
// アンマウントやパラメータ変更時に古いレスポンスで setState しないよう
// cancelled フラグでガードする。ミューテーションは扱わない。
export const useApiResource = <T>(
  path: string | null,
  options?: UseApiResourceOptions,
): UseApiResourceResult<T> => {
  const enabled = options?.enabled ?? true;
  // 取得予定なら最初から loading で初期化し、idle の一瞬のちらつきを避ける。
  const [state, setState] = useState<ResourceState<T>>(() =>
    path && enabled ? { kind: 'loading' } : { kind: 'idle' },
  );
  const [reloadKey, setReloadKey] = useState(0);
  // 直近の reload がバックグラウンド要求だったかを次の effect 実行に伝える。
  const backgroundReloadRef = useRef(false);
  // effect の依存に state を入れずに最新値を参照するための ref。
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback((opts?: ReloadOptions) => {
    backgroundReloadRef.current = opts?.background ?? false;
    setReloadKey((k) => k + 1);
  }, []);

  // reloadKey は本文では参照しないが、reload() による手動再取得のトリガーとして
  // 依存配列に必要（path/enabled が同じでも再フェッチさせる）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional refetch trigger
  useEffect(() => {
    if (!path || !enabled) {
      setState({ kind: 'idle' });
      return;
    }
    const background = backgroundReloadRef.current;
    backgroundReloadRef.current = false;
    let cancelled = false;
    // バックグラウンド再取得かつ既にデータ表示中なら loading に戻さず、
    // 現在のデータを表示したまま裏で更新する。それ以外（初回・path 変更・
    // エラーからの再取得）は従来どおり loading を表示する。
    if (!(background && stateRef.current.kind === 'ok')) {
      setState({ kind: 'loading' });
    }
    void (async () => {
      try {
        const data = await apiJson<T>(path);
        if (!cancelled) setState({ kind: 'ok', data });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: apiErrorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, enabled, reloadKey]);

  return { state, reload };
};
```

- [ ] **Step 2: Verify ui + admin still type-check (existing callers unaffected)**

Run: `pnpm --filter @tecnova/ui --filter admin type-check`
Expected: PASS. `reload(opts?: ReloadOptions)` has zero required params, so it remains assignable to existing `() => void` callbacks (`onCreated={reload}`, etc.) — no admin change needed yet.

- [ ] **Step 3: Verify Biome**

Run: `pnpm biome check packages/ui/src/hooks/use-api-resource.ts`
Expected: PASS (the `useExhaustiveDependencies` ignore comment is retained).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/hooks/use-api-resource.ts
git commit -m "$(printf 'feat(ui): add background (stale-while-revalidate) reload to useApiResource\n\nreload({ background: true }) keeps current data visible during refetch\ninstead of flipping to loading, for flicker-free refresh buttons.\nBackward compatible: default is the existing loading behavior.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Create `CheckinErrorScreen`

**Files:**
- Create: `apps/checkin/src/components/screen-error.tsx`

- [ ] **Step 1: Write the component**

Confirm the exact `Alert` import path by matching an existing checkin page (e.g. `manual/page.tsx` imports `Alert, AlertTitle, AlertDescription` from `@tecnova/ui/components/alert`). Write:

```tsx
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

// checkin（iPad キオスク）共通の全画面エラー。bg-rose-50 の全画面 +
// destructive Alert。ページ固有のボタンを actions に、任意の補足
// （ID 行 / 詳細カード等）を footer に渡す。inline の小さなエラーは対象外。
export function CheckinErrorScreen({
  title,
  message,
  actions,
  footer,
}: {
  title: string;
  message: string;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-rose-50 p-6 text-center">
      <Alert variant="destructive" className="max-w-xl text-left text-lg">
        <IconAlertCircle className="size-6" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {footer}
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">{actions}</div>
    </main>
  );
}
```

- [ ] **Step 2: Verify type-check + Biome**

Run: `pnpm --filter checkin type-check && pnpm biome check apps/checkin/src/components/screen-error.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/checkin/src/components/screen-error.tsx
git commit -m "$(printf 'feat(checkin): add shared CheckinErrorScreen for full-screen kiosk errors\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Migrate `first-time/page.tsx` GET to `useApiResource`

**Files:**
- Modify: `apps/checkin/src/app/first-time/page.tsx`

- [ ] **Step 1: Update imports**

- Remove `import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';` (both become unused).
- Add `import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';`.
- Change `import { useCallback, useEffect, useMemo, useState } from 'react';` → `import { useMemo, useState } from 'react';` (`useCallback`/`useEffect` become unused).
- Add `import { CheckinErrorScreen } from '@/components/screen-error';` in the `@/components/*` group.
- Keep `Alert`/`AlertTitle`/`AlertDescription`/`IconAlertCircle`/`IconRefresh` — still used by the two inline Alerts and the inline 更新 button.

- [ ] **Step 2: Remove the fetch state machine**

Delete: the `type State` union (fetch-only, lines ~42–45); the `const [state, setState] = useState<State>(...)`; the `loadParticipants` `useCallback`; and the `useEffect(() => { void loadParticipants(); }, [loadParticipants])`.

- [ ] **Step 3: Add the hook + rewrite derived reads**

At the top of `FirstTimePage`, replace the removed state with:
```tsx
  const { state, reload } = useApiResource<PreRegisteredListResponse>('/checkin/pre-registered');
  const [query, setQuery] = useState('');
```
Rewrite `filteredItems` to read from the `ok` data:
```tsx
  const filteredItems = useMemo(() => {
    if (state.kind !== 'ok') return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return state.data.participants;
    return state.data.participants.filter((item) => {
      const values = [
        item.fullName,
        item.nickname,
        item.grade,
        item.registeredAt,
        formatJapaneseDate(item.registeredAt),
      ];
      return values.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, state]);
```
In the data UI, change `state.items.length` → `state.data.participants.length` (the count Badge and the empty-list check), and the inline 更新 button `onClick={() => void loadParticipants()}` → `onClick={reload}`.

- [ ] **Step 4: Replace the full-screen error branch with `CheckinErrorScreen`**

The loading branch (`state.kind === 'loading'`) and both inline Alerts stay unchanged. Replace the error block:
```tsx
  if (state.kind === 'error') {
    return (
      <CheckinErrorScreen
        title="一覧を表示できません"
        message={state.message}
        actions={
          <>
            <Button type="button" size="lg" onClick={reload} className="h-16 text-xl">
              <IconRefresh className="size-6" data-icon="inline-start" />
              再読み込み
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
              <Link href="/">ホームに戻る</Link>
            </Button>
          </>
        }
      />
    );
  }
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter checkin type-check && pnpm biome check apps/checkin/src/app/first-time/page.tsx`
Expected: PASS. Manually (`/first-time`): skeleton → list; search filters; empty-list and empty-search Alerts still appear; kill the API → `CheckinErrorScreen` (一覧を表示できません); 再読み込み recovers.

- [ ] **Step 6: Commit**

```bash
git add apps/checkin/src/app/first-time/page.tsx
git commit -m "$(printf 'refactor(checkin): migrate first-time page to useApiResource\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Migrate `history/page.tsx` GET to `useApiResource` (background 更新)

**Files:**
- Modify: `apps/checkin/src/app/history/page.tsx`

- [ ] **Step 1: Update imports**

- Add `import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';`.
- Add `import { CheckinErrorScreen } from '@/components/screen-error';`.
- Drop `useCallback` from the `react` import (keep `useEffect`, `useMemo`, `useState`).
- Keep `apiFetch, readErrorMessage` (still used by `postHistoryBulkCheckOut`), and `Alert`/`AlertTitle`/`AlertDescription`/`IconAlertCircle`/`IconHome`/`IconRefresh` (success/mutation-error Alerts + actions).

- [ ] **Step 2: Remove fetch helper, fetch state, fetch effect, old ErrorScreen**

Delete: `fetchTodayHistory` (incl. its `cache: 'no-store'`); the `function ErrorScreen({ message, onRetry })` definition; `const [data, setData] = useState<...>(null)` and `const [isLoading, setIsLoading] = useState(true)`; the `loadSessions` `useCallback`; the `useEffect(() => { void loadSessions(); }, [loadSessions])`; and the old early returns `if (isLoading) return <LoadingScreen/>` and `if (error && !data) return <ErrorScreen.../>`.
**Do NOT remove** `nowMs` state, the 60s `setInterval` effect, or any mutation state (`isSubmitting`/`error`/`lastResult`).

- [ ] **Step 3: Add hook + a derived `data` + selection-prune effect**

Replace the removed fetch state with the hook and a single derived `data` so the existing `data?.…` derivations keep compiling:
```tsx
  const { state, reload } = useApiResource<TodaySessionsResponse>('/checkin/history/today');
  // ...keep isSubmitting / error / query / selectedIds / lastResult / nowMs as-is...

  // useApiResource が ok のときだけ実データ。それ以外は null で描画ロジックを共通化。
  const data = state.kind === 'ok' ? state.data : null;
```
Keep the 60s timer effect unchanged. Keep `const sessions = data?.sessions ?? [];` and all `useMemo` derivations. The old `loadSessions` pruned `selectedIds` after each refetch — reproduce that with an effect after `presentIdSet` is defined:
```tsx
  // 取得結果が変わったら、もう滞在中でない参加者を選択から外す
  // （旧 loadSessions の selectedIds 絞り込みを再取得後も維持）。
  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => presentIdSet.has(id)));
  }, [presentIdSet]);
```

- [ ] **Step 4: Background 更新 + render branches**

In `checkoutParticipants`, change the post-success refetch `loadSessions({ showLoading: false })` → `reload({ background: true })` (keeps the table visible; no flash). Change the in-card 更新 button `onClick={() => void loadSessions({ showLoading: false })}` → `onClick={() => reload({ background: true })}`. Add the new branches (place after `checkoutParticipants`, before the `summary`/`eventLabel` derivation):
```tsx
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <LoadingScreen />;
  }

  if (state.kind === 'error') {
    return (
      <CheckinErrorScreen
        title="履歴を表示できません"
        message={state.message}
        actions={
          <>
            <Button asChild size="lg" className="h-16 text-xl">
              <Link href="/">
                <IconHome className="size-6" data-icon="inline-start" />
                ホームに戻る
              </Link>
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={reload} className="h-16 text-xl">
              <IconRefresh className="size-6" data-icon="inline-start" />
              再読み込み
            </Button>
          </>
        }
      />
    );
  }
```
Keep `const summary = data?.summary ?? {...}` and `const eventLabel = data?.event ? ... : '今日'` as optional-chained (TS narrows `state`, not `data`). The success Alert, inline mutation-error Alert, empty-state block, table, and motion stay unchanged.

- [ ] **Step 5: Verify**

Run: `pnpm --filter checkin type-check && pnpm biome check apps/checkin/src/app/history/page.tsx`
Expected: PASS. Manually (`/history`): skeleton → table; stay-duration updates ~each minute (timer intact); tap 更新 → **no skeleton flash**, data refreshes in place (background reload); bulk checkout → success Alert + list refresh, no flash; kill API + reload → `CheckinErrorScreen` (履歴を表示できません), 再読み込み recovers. (Note: a failed background 更新 surfaces the full error screen — accepted per spec.)

- [ ] **Step 6: Commit**

```bash
git add apps/checkin/src/app/history/page.tsx
git commit -m "$(printf 'refactor(checkin): migrate history page to useApiResource (background refresh)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Migrate `reception/participants/[id]/page.tsx` GET, split POST state

**Files:**
- Modify: `apps/checkin/src/app/reception/participants/[id]/page.tsx`

- [ ] **Step 1: Update imports**

- Remove `import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';` (only the old `ErrorScreen` used them).
- Remove `IconAlertCircle` from the `@tabler/icons-react` import (only the old `ErrorScreen` used it). Keep `IconHome`/`IconArrowBack`/`IconLogin2`/`IconLogout2`.
- Add `import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';`.
- Add `import { CheckinErrorScreen } from '@/components/screen-error';`.
- Keep `apiFetch, readErrorMessage` (used by `postAttendance`). Drop `useEffect` from the React import (the fetch effect is removed; `useCallback` stays — used by `measureTileGrid`).

- [ ] **Step 2: Remove fetch machinery + old ErrorScreen; replace state union**

Delete: the `fetchParticipantProfile` helper (incl. `cache: 'no-store'`); the `function ErrorScreen({ message, participantId })`; the `const [state, setState] = useState<State>(...)`; the `loadProfile` `useCallback`; the fetch `useEffect`; and the four old `state.kind`-based render branches. Replace the `type State` union with a POST-only `Action`:
```tsx
// 取得は useApiResource に委譲。ここでは出退場 POST の進行状態だけを持つ。
type Action =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'result'; data: ScanResponse }
  | { kind: 'error'; message: string };
```

- [ ] **Step 3: Add hook + action state + derived values**

```tsx
  const params = useParams<{ id: string }>();
  const participantId = String(params.id ?? '');
  const prefersReduced = useReducedMotion();

  // 5桁ID以外はそもそも取得しない（取得前のローカル検証エラー）。
  const isValidId = PARTICIPANT_ID_PATTERN.test(participantId);
  const { state } = useApiResource<ParticipantProfileResponse>(
    `/checkin/participants/${participantId}`,
    { enabled: isValidId },
  );

  const [action, setAction] = useState<Action>({ kind: 'idle' });

  const profile = state.kind === 'ok' ? state.data : null;
  const isSubmitting = action.kind === 'submitting';
```
(No retry button on this page → do **not** destructure `reload`; that avoids an unused-var lint.)

- [ ] **Step 4: Rewrite `submitAttendance` to use `action`**

```tsx
  const submitAttendance = async () => {
    if (!profile) return;
    setAction({ kind: 'submitting' });
    try {
      const data = await postAttendance(profile.participant.id);
      setAction({ kind: 'result', data });
    } catch (e) {
      setAction({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
```

- [ ] **Step 5: Rewrite render branches (order matters)**

POST `result` and POST `error` and invalid-ID must be checked BEFORE fetch state. Build the shared `footer`/`actions` once (the `ID {participantId}` line as `footer`; ホームに戻る + 入力し直す as `actions`). Branch order:
1. `if (action.kind === 'result') { ... }` — render the existing `ResultSummaryCard` exactly as before, reading `action.data` (was `state.data`).
2. `if (!isValidId) { return <CheckinErrorScreen title="参加者を表示できません" message="5桁の参加者IDを入力してください" footer={<p className="text-base font-bold text-rose-900/70 tabular-nums">ID {participantId}</p>} actions={<>…ホームに戻る…入力し直す…</>} /> }`.
3. `if (action.kind === 'error') { return <CheckinErrorScreen title="参加者を表示できません" message={action.message} footer={…ID line…} actions={…same two buttons…} /> }`.
4. `if (state.kind === 'loading' || state.kind === 'idle') { return <LoadingScreen />; }`.
5. `if (state.kind === 'error') { return <CheckinErrorScreen title="参加者を表示できません" message={state.message} footer={…ID line…} actions={…same two buttons…} /> }`.
6. `if (!profile) return null;`

The shared `actions` JSX (identical in branches 2/3/5):
```tsx
<>
  <Button asChild size="lg" className="h-16 text-xl">
    <Link href="/">
      <IconHome className="size-6" data-icon="inline-start" />
      ホームに戻る
    </Link>
  </Button>
  <Button asChild variant="secondary" size="lg" className="h-16 text-xl">
    <Link href="/manual">
      <IconArrowBack className="size-6" data-icon="inline-start" />
      入力し直す
    </Link>
  </Button>
</>
```
All JSX below `if (!profile) return null;` (heatmap, history table, motion, `measureTileGrid`) stays unchanged.

- [ ] **Step 6: Verify**

Run: `pnpm --filter checkin type-check && pnpm biome check "apps/checkin/src/app/reception/participants/[id]/page.tsx"`
Expected: PASS. Manually: valid id → skeleton → profile; check-in/out → `ResultSummaryCard`, no flash back to profile/error; `/reception/participants/abc` → error (5桁の参加者IDを入力してください) with `ID abc` footer + both buttons; valid-format non-existent id → API error in the same screen.

- [ ] **Step 7: Commit**

```bash
git add "apps/checkin/src/app/reception/participants/[id]/page.tsx"
git commit -m "$(printf 'refactor(checkin): migrate reception detail page to useApiResource\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Migrate `manual/page.tsx` debounced search (drop AbortController)

**Files:**
- Modify: `apps/checkin/src/app/manual/page.tsx`

- [ ] **Step 1: Update imports**

- Remove `import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';` (only `searchParticipants` used them).
- Add `import { type ResourceState, useApiResource } from '@tecnova/ui/hooks/use-api-resource';` (mixed value/type import, matching admin).
- Keep `useEffect`/`useState` (debounce effect stays), `Alert`/`AlertTitle`/`AlertDescription`/`IconAlertCircle` (inline error Alert stays). Do **not** import `CheckinErrorScreen` — this page has no full-screen error.

- [ ] **Step 2: Remove `SearchState`, `searchParticipants`, fetch state + AbortController effect**

Delete the `type SearchState` union; the `searchParticipants` helper (incl. `cache: 'no-store'` + `signal`); the `const [state, setState] = useState<SearchState>({ kind: 'idle' })`; and the entire second `useEffect` (the AbortController fetch). **Keep** the FIRST `useEffect` (300ms debounce).

- [ ] **Step 3: Add derived path + hook in `NameSearchPanel`**

```tsx
  // 入力のたびに API を叩かないよう 300ms デバウンス（既存のまま）。
  // debouncedQuery が空なら path=null → フックは idle のまま。
  // path が変わるとフックが自動で再取得し、古いレスポンスは cancelled フラグで破棄。
  const searchPath = debouncedQuery
    ? `/checkin/participants/search?${new URLSearchParams({ q: debouncedQuery }).toString()}`
    : null;
  const { state } = useApiResource<ParticipantSearchResponse>(searchPath);
```
Pass `state={state}` to `<SearchResults>` (unchanged prop name).

- [ ] **Step 4: Update `SearchResults` to read `state.data.participants`**

Change the prop type `state: SearchState` → `state: ResourceState<ParticipantSearchResponse>`. The idle/loading/error inline UI stays byte-identical. In the `ok`/empty/list branches, change `state.results` → `state.data.participants` (3 reads: the empty-length check, the `{…}件の候補` count, and the `.map`).

- [ ] **Step 5: Verify**

Run: `pnpm --filter checkin type-check && pnpm biome check apps/checkin/src/app/manual/page.tsx`
Then: `grep -n "apiFetch\|readErrorMessage\|AbortController\|no-store\|SearchState" apps/checkin/src/app/manual/page.tsx` → expect ZERO hits.
Manually (`/manual` → 名前で探す): idle hint; type → 3 skeletons → results or empty message; fast typing shows no stale flash; kill API → inline destructive Alert (検索に失敗しました), NOT full-screen; tapping a result navigates and disables rows.

- [ ] **Step 6: Commit**

```bash
git add apps/checkin/src/app/manual/page.tsx
git commit -m "$(printf 'refactor(checkin): migrate manual search to useApiResource\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Migrate `guideline/page.tsx` GET, derive item, split mutation state

**Files:**
- Modify: `apps/checkin/src/app/guideline/page.tsx`

- [ ] **Step 1: Update imports**

- Add `import { useApiResource } from '@tecnova/ui/hooks/use-api-resource';` and `import { CheckinErrorScreen } from '@/components/screen-error';`.
- Change `import { apiFetch, readErrorMessage } from '@tecnova/ui/lib/api-client';` → `import { apiFetch } from '@tecnova/ui/lib/api-client';` (`apiFetch` stays for activate POST; `readErrorMessage` removed).
- Remove `useCallback` from the React import (only `loadTarget` used it); keep `useEffect` (arrow-key handler in `GuidelineSlideView`).
- Remove `Alert, AlertDescription, AlertTitle` (line ~36) and `IconAlertCircle` (icon import) — only the deleted inline `ErrorScreen` used them; confirm no other usage with grep before deleting.

- [ ] **Step 2: Remove old `ErrorScreen`, `loadTarget`, its effect, and fetch render branches; replace state union**

Delete: the `function ErrorScreen({ title, message, item, onRetry })`; the `loadTarget` `useCallback`; the `useEffect(() => { void loadTarget(); }, [loadTarget])`; the old `if (state.kind === 'loading')`, `if (state.kind === 'error')`, and `if (!slide)` branches. Replace the `type State` with a mutation-only union:
```tsx
// 取得（pre-registered 一覧）は useApiResource。ここはアクティベート POST の
// ワークフロー状態のみ（取得状態とは分離）。
type MutationState =
  | { kind: 'idle' }
  | { kind: 'activating'; item: PreRegisteredParticipant }
  | { kind: 'result'; data: ActivateResponse; registeredAt: string }
  | { kind: 'error'; message: string; item: PreRegisteredParticipant };
```

- [ ] **Step 3: Rewrite `GuidelinePageContent` (hook + derived item + activate)**

```tsx
function GuidelinePageContent() {
  const searchParams = useSearchParams();
  const preRegistrationId = searchParams.get('preRegistrationId') ?? '';
  const [mutation, setMutation] = useState<MutationState>({ kind: 'idle' });
  const [slideIndex, setSlideIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [direction, setDirection] = useState(1);

  const { state, reload } = useApiResource<PreRegisteredListResponse>('/checkin/pre-registered', {
    enabled: !!preRegistrationId,
  });

  const item = useMemo(
    () =>
      state.kind === 'ok'
        ? (state.data.participants.find(
            (participant) => participant.preRegistrationId === preRegistrationId,
          ) ?? null)
        : null,
    [state, preRegistrationId],
  );

  const goPrev = () => { setDirection(-1); setSlideIndex((i) => Math.max(0, i - 1)); };
  const goNext = () => { setDirection(1); setSlideIndex((i) => Math.min(GUIDELINE_SLIDES.length - 1, i + 1)); };

  const activate = async () => {
    if (!item) return;
    setMutation({ kind: 'activating', item });
    try {
      const r = await apiFetch('/checkin/activate', {
        method: 'POST',
        body: { preRegistrationId: item.preRegistrationId },
      });
      const body = (await r.json()) as ActivateResponse | { error: string; message: string };
      if (!r.ok) {
        const msg = 'message' in body ? body.message : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setMutation({ kind: 'result', data: body as ActivateResponse, registeredAt: item.registeredAt });
    } catch (e) {
      setMutation({ kind: 'error', message: e instanceof Error ? e.message : String(e), item });
    }
  };

  const slide = useMemo(() => GUIDELINE_SLIDES[slideIndex], [slideIndex]);
  // ...render branches below...
}
```
(Verify the activate POST body/response shape against the current code; keep it identical — only the `item` source changed from `state.item` to the derived `item`.)

- [ ] **Step 4: Render branches (mutation first, then fetch)**

Order: `activating` → `result` (existing `ResultSummaryCard`, unchanged) → mutation `error` → `!preRegistrationId` (idle) → fetch `loading`/`idle` → fetch `error` → not-found (`!item`) → `!slide` → `GuidelineSlideView`. Five of these are `CheckinErrorScreen`. Per the resolved decision, the **mutation-error** and **fetch/not-found/no-slide** retry buttons all use 再読み込み wired to `reload` (preserves the original, where `onRetry={loadTarget}` re-fetched the list). The `!preRegistrationId` idle case uses ホームに戻る (no retry — matches original idle path). `actions` use the existing 選び直す(`/first-time`) + (再読み込み `onClick={reload}` | ホームに戻る `/`). The mutation-error `footer` is `<div className="w-full max-w-xl text-left"><ParticipantDetails item={mutation.item} /></div>`. Messages:
- mutation error: title `登録できませんでした`, message `mutation.message`, footer ParticipantDetails, actions 選び直す + 再読み込み(`reload`).
- `!preRegistrationId`: title `ガイドラインを表示できません`, message `登録する人を選んでください。`, actions 選び直す + ホームに戻る.
- fetch error: title `ガイドラインを表示できません`, message `state.message`, actions 選び直す + 再読み込み(`reload`).
- not-found (`state.kind==='ok' && !item`): message `この事前登録はすでに登録済み、または一覧にありません。`, actions 選び直す + 再読み込み(`reload`).
- `!slide`: message `ガイドラインを表示できません。`, actions 選び直す + 再読み込み(`reload`).

Finally render `<GuidelineSlideView item={item} slide={slide} ... onSubmit={() => void activate()} />` (was `state.item`). `LoadingScreen` stays for `state.kind === 'loading' || 'idle'`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter checkin type-check && pnpm biome check apps/checkin/src/app/guideline/page.tsx`
Then `grep -n "IconAlertCircle\|AlertTitle\|AlertDescription\|<Alert\|readErrorMessage\|loadTarget" apps/checkin/src/app/guideline/page.tsx` → expect ZERO hits.
Manually: `/guideline` (no id) → 登録する人を選んでください。; `?preRegistrationId=<valid>` → skeleton → slides → 同意 → activate → 登録できました; `<bogus>` → not-found + working 再読み込み; kill API → fetch error + 再読み込み.

- [ ] **Step 6: Commit**

```bash
git add apps/checkin/src/app/guideline/page.tsx
git commit -m "$(printf 'refactor(checkin): migrate guideline page to useApiResource\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: Apply background reload to admin refresh/mutation refetch

**Files:**
- Modify: `apps/admin/src/app/(authed)/page.tsx` (1 site)
- Modify: `apps/admin/src/app/(authed)/mentors/page.tsx` (3 sites)
- Modify: `apps/admin/src/app/(authed)/pre-registrations/page.tsx` (3 sites)

All admin `reload()` calls are manual-refresh or post-mutation refetches (none are path-driven), so all opt into `background: true` to remove the skeleton flash.

- [ ] **Step 1: Dashboard refresh button**

In `apps/admin/src/app/(authed)/page.tsx`, change the 更新 button (line ~99):
```tsx
onClick={() => sessions.reload({ background: true })}
```

- [ ] **Step 2: Mentors post-mutation refetch**

In `apps/admin/src/app/(authed)/mentors/page.tsx`, wrap the three `reload` callbacks:
- `<CreateMentorForm onCreated={() => reload({ background: true })} />`
- both `<MentorRow ... onUpdated={() => reload({ background: true })} ... />` (card + row variants).

- [ ] **Step 3: Pre-registrations post-mutation refetch**

In `apps/admin/src/app/(authed)/pre-registrations/page.tsx`, wrap the three callbacks:
- `<CreatePreRegistrationForm onCreated={() => reload({ background: true })} />`
- both `onDeleted={() => reload({ background: true })}`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter admin type-check && pnpm biome check apps/admin/src/app/\(authed\)/page.tsx apps/admin/src/app/\(authed\)/mentors/page.tsx apps/admin/src/app/\(authed\)/pre-registrations/page.tsx`
Expected: PASS. Manually (admin): dashboard 更新 refreshes **without** a skeleton flash; creating/updating a mentor and creating/deleting a pre-registration update the list in place without a flash; the initial loads and any error states are unchanged.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(authed)/page.tsx" "apps/admin/src/app/(authed)/mentors/page.tsx" "apps/admin/src/app/(authed)/pre-registrations/page.tsx"
git commit -m "$(printf 'refactor(admin): use background reload for refresh and post-mutation refetch\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check all affected workspaces**

Run: `pnpm --filter @tecnova/ui --filter checkin --filter admin type-check`
Expected: PASS for ui/checkin/admin. (If a stale `.next/dev/types/validator.ts` error appears for checkin from a running dev server, stop the dev server and re-run — that artifact is environmental, not source.)

- [ ] **Step 2: Biome across touched source**

Run: `pnpm biome check packages/ui/src apps/checkin/src apps/admin/src`
Expected: PASS.

- [ ] **Step 3: Confirm duplication removed**

Run: `grep -rn "type State" apps/checkin/src/app` — expect only mutation/`MutationState`/`Action` unions remain (no fetch-only `loading|list|error` / `loading|ready|error` machines). Run `grep -rn "AbortController\|no-store" apps/checkin/src/app` → expect ZERO hits.

- [ ] **Step 4: Playwright smoke (checkin + admin)**

With `pnpm --filter checkin dev` (:3000) and `pnpm --filter admin dev` (:3001) and `/api/me` + endpoints mocked (route-mock with CORS headers, as in prior sessions), confirm for each checkin page: load → ok, forced error → `CheckinErrorScreen` (or inline for manual), retry/reload recovers, empty states render. Confirm history 更新 and admin refresh/mutation reloads show **no skeleton flash**. Verify `reload()`/navigation return fresh data (no stale cache).

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin refactor/checkin-data-layer
gh pr create --base develop --head refactor/checkin-data-layer \
  --title "refactor(checkin): propagate useApiResource + add background reload" \
  --body "$(printf '## 概要\ncheckin の 5 つの GET を共有 useApiResource に統合し、全画面エラーを CheckinErrorScreen に集約。共有フックに background(SWR) reload を追加し、history 更新と admin の更新/ミューテーション再取得のちらつきを解消。signage は対象外、認証は不変。\n\n設計: docs/superpowers/specs/2026-06-02-checkin-data-layer-propagation-design.md\n計画: docs/superpowers/plans/2026-06-02-checkin-data-layer-propagation.md\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
```

---

## Notes on resolved decisions

- **history 更新**: uses `reload({ background: true })` — no skeleton flash on success. A failed background refresh surfaces the full `CheckinErrorScreen` (consistent with admin's reload-on-error behavior); accepted per spec.
- **guideline activate-error**: retry button is 再読み込み wired to `reload` (preserves the original `onRetry={loadTarget}` semantics — re-fetches the list, not the POST).
- **reception POST failure**: routes to the full-screen error (`action.kind === 'error'`), preserving the original behavior.
- **admin**: all `reload()` callers opt into `background: true` (the opted-in flash fix). Initial loads and path-driven refetches (search/filter/pagination/date) are unchanged.
