# admin データ層モダナイゼーション 設計（リサーチ結論つき）

作成日: 2026-06-02 / 対象: `apps/admin`（一部 `packages/ui` 共有）/ Next.js 16.2.4 + React 19

## 0. 背景とゴール

「Next.js のモダンなフォールバック / PPR が活かせる箇所を見直し、リファクタリングも兼ねて改善する」という依頼を受け、exa Web 検索＋バージョン同梱ドキュメント（`node_modules/.pnpm/next@16.2.4`）＋実コードで調査した。結論として **PPR / サーバーサイド・ストリーミングは現アーキテクチャには素直に効かない**。代わりに **クライアント取得パターンの共通化（リファクタリング）** が高価値・低リスクで、その先に段階的にサーバー取得への道がある。

### リサーチ結論（要点）

- **PPR は 16.2.4 で `cacheComponents: true` に統合済み。`experimental.ppr` を設定するとハードエラー（ビルド不可）。** PPR/Cache Components は「サーバーレンダリングされる・キャッシュ可能・サーバー取得される」コンテンツの静的シェル＋ストリーミングに効く。admin は全ページが `'use client'` で `useEffect`＋`apiFetch` によりクロスオリジン API から取得しており、サーバー側にシェルへ畳み込めるデータが無い → **効果ゼロ・移行コストのみ**。`cacheComponents` は **有効化しない**。
- **`loading.tsx` / Suspense は「サーバーコンポーネントが suspend したとき」しか発火しない。** `useEffect` 取得のクライアントページは描画時に suspend しないため、`loading.tsx` はナビゲーション直後に一瞬出て、API 取得完了前に消える。さらに `MeProvider` の認証ゲート（クライアント側 `/api/me` 待ち）に覆い隠される。現状のページ内スケルトン状態機械が正しい。
- **サーバー取得は現状不可能。** Better Auth のセッション Cookie は **host-only**（`apps/api/src/lib/auth.ts` に `advanced.crossSubDomainCookies` 等の設定なし）で、API オリジン（`tecnova-api.sz-lab.jp` / `:8787`）にのみ発行される。admin オリジンの Next.js サーバーは `cookies()` でセッションを読めず、API へサーバー取得できない。解放には BFF プロキシ or クロスサブドメイン Cookie が必要（別サブプロジェクト）。
- **真の高価値リファクタ＝重複の共通化。** `loading|ok|error` の取得状態機械が **6 箇所**（5 ページ＋詳細シート）でほぼ同形に重複。エラー用 `Alert`・空状態ブロックもページごとに再実装。レンダリング時クラッシュを拾う error boundary も無い。

### ゴール

クライアント取得アーキテクチャを維持したまま、(1) 取得/ローディング/エラーの重複を共通プリミティブへ集約し、(2) 体感速度と耐障害性を上げ、(3) 将来のサーバー取得への移行口を用意する。**段階的に・低リスク順に**進める。

---

## 1. サブプロジェクト分割（この順に実装）

| # | 名称 | 主眼 | リスク | 依存 |
|---|------|------|--------|------|
| 1 | データ層の共通化 | `useApiResource` フック＋`DataError`/`EmptyState`。6 箇所の重複を解消 | 低（挙動・UI 不変） | なし |
| 2 | 耐障害性＋即時シェル | `(authed)/error.tsx`、`MeProvider` 即時シェル化、各ルート `loading.tsx`＋ページスケルトン抽出 | 中（共有 `MeProvider` に波及） | 1 |
| 3 | サーバー取得 | BFF or クロスサブドメイン Cookie → 閲覧系をサーバー取得＋Suspense ストリーミング | 高（認証・セキュリティ・dev 環境） | 1, 2 |

各サブプロジェクトは独立した spec → plan → 実装サイクルを持つ。本書はサブプロジェクト 1 を詳細化し、2・3 は概要と未決事項を記す。

---

## 2. サブプロジェクト 1（詳細）: データ層の共通化

### 2.1 新規プリミティブ（`packages/ui`）

#### `packages/ui/src/lib/use-api-resource.ts`（`'use client'`）

```ts
export type ResourceState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

export interface UseApiResourceResult<T> {
  state: ResourceState<T>;
  reload: () => void;
}

// path が null か enabled=false のとき idle（取得しない）。
// path が変わると自動で再取得する（クエリ文字列を path に含めることで
// 検索・フィルタ・ページング・日付変更の再取得を表現する）。
// reload() は手動再取得（更新ボタン・ミューテーション後の再読込）。
export function useApiResource<T>(
  path: string | null,
  options?: { enabled?: boolean },
): UseApiResourceResult<T>;
```

実装方針：
- 内部は `useState<ResourceState<T>>` ＋ `reloadKey`（`reload()` で increment）。
- `useEffect`（依存 `[path, enabled, reloadKey]`）で: `!path || enabled===false` → `idle` にして return。それ以外は `loading` にしてから `apiJson<T>(path)` を呼ぶ。`participant-detail-sheet.tsx` 既存の **cancelled フラグ** によるアンマウント/パラメータ変更時の競合防止を踏襲。
- エラー文言は既存の正規ヘルパ `apiErrorMessage(e)` を使う（文言生成も統一）。
- `apiJson` は 204 を扱わない（JSON 前提）。削除など 204 を返す系は従来どおりページ側の `apiFetch` を使う（フックの対象外＝ミューテーションは扱わない、読み取り専用フック）。

#### `packages/ui/src/components/data-error.tsx`

```tsx
// 取得失敗時の destructive Alert（任意で再試行ボタン）。
export function DataError({
  title = '読み込めませんでした',
  message,
  onRetry,
}: { title?: string; message: string; onRetry?: () => void }): JSX.Element;
```

#### `packages/ui/src/components/empty-state.tsx`

```tsx
// 中央寄せの空状態ブロック（rounded-2xl border bg-card）。任意でアイコン。
export function EmptyState({
  icon: Icon,
  message,
  className,
}: { icon?: ComponentType<{ className?: string }>; message: string; className?: string }): JSX.Element;
```

いずれも `packages/ui` の barrel/慣例に合わせてエクスポート。`apps/admin/next.config.ts` の `transpilePackages` は既に `@tecnova/ui` を含むため追加設定不要。

### 2.2 移行（admin 6 箇所）

| 箇所 | path | enabled | reload 用途 |
|------|------|---------|-------------|
| dashboard `page.tsx` | `selectedDate===TODAY ? '/api/sessions' : '/api/sessions?date=…'` ＋ 別途 `/api/events`（best-effort） | 常時 | 更新ボタン |
| participants | `/api/participants?page=&limit=&search=&grade=&active=`（debounced） | 常時 | — |
| stats | `/api/stats/participation?from=&to=`（適用済みレンジ） | 常時 | — |
| mentors | `/api/mentors` | `me.mentor.role==='admin'` | 作成/更新後 |
| pre-registrations | `/api/pre-registrations` | `me.mentor.role==='admin'` | 作成/削除後 |
| `participant-detail-sheet.tsx` | `participantId ? '/checkin/participants/:id' : null` | — | — |

- フックは常に無条件で呼ぶ（hooks ルール）。ロールゲートの早期 return（アクセス権限 Alert）はフック呼び出しの **後** に置く（現状と同じ並び）。
- 各ページの `type State`・`useEffect`・`useCallback(load)` を撤去し、`useApiResource` の `state`/`reload` に置換。
- エラー表示を `<DataError>`、空状態を `<EmptyState>` に置換。
- `events` は best-effort なので別の `useApiResource('/api/events')` を使い、`ok` のときだけ `events` を読む（エラーは無視）。

### 2.3 ファイル構成

- 新規: `packages/ui/src/lib/use-api-resource.ts`, `packages/ui/src/components/data-error.tsx`, `packages/ui/src/components/empty-state.tsx`
- 変更: `apps/admin/src/app/(authed)/page.tsx`, `participants/page.tsx`, `stats/page.tsx`, `mentors/page.tsx`, `pre-registrations/page.tsx`, `apps/admin/src/components/participant-detail-sheet.tsx`

### 2.4 非ゴール / 不変条件

- UI・挙動・エンドポイント・debounce・ページング・ロールゲートは **不変**（純粋な内部リファクタ）。
- ミューテーション（POST/PATCH/DELETE）はフック化しない（読み取り専用）。
- `cacheComponents`/PPR は有効化しない。
- checkin/signage は本サブプロジェクトでは変更しない（フックは将来 checkin にも転用可能だが対象外）。

### 2.5 検証

- `pnpm --filter admin --filter @tecnova/ui type-check` と `pnpm biome check apps/admin/src packages/ui/src` が green。
- Playwright（`/api/me`＋各データをモック）で 5 ページ＋詳細シートが従来どおり描画・検索・フィルタ・ページング・更新・ミューテーション後再読込・エラー/空状態表示することを確認（デスクトップ/モバイル）。
- 重複していた `type State` / `useEffect` 取得ロジックが各ページから消えていること。

---

## 3. サブプロジェクト 2（概要）: 耐障害性＋即時シェル

- `apps/admin/src/app/(authed)/error.tsx`（`'use client'` 必須）: レンダリング時クラッシュの安全網。`DataError` を再利用。ルート直下にも最小の `error.tsx` を検討。
- `MeProvider` 即時シェル化: 現状は `/api/me` 解決までツリー全体をスケルトンで止める。`AppShell` のクローム（サイドバー/ナビ）を即描画し、**ページ本文だけ**を認証待ちにする。`packages/ui` 共有のため checkin/signage への影響を要確認（オプトイン or 後方互換に注意）。
- ページスケルトン抽出（`ListPageSkeleton` 等）→ ページ内ローディングと将来の `loading.tsx` の両方を 1 コンポーネントで賄う。
- `loading.tsx` は「ナビゲーション/コールド JS の窓」だけに効く点を理解した上で、即時シェル化後に追加（それ以前は `MeProvider` に隠れて無価値）。
- 任意: ミューテーションフォームに React 19 `useOptimistic`。

未決: `MeProvider` を共有のまま変えるか、admin 専用ラッパに切り出すか。

---

## 4. サブプロジェクト 3（概要・別設計）: サーバー取得

**前提となる認証アーキテクチャの決定（要ブレスト）:**

- **案A: 同一オリジン BFF プロキシ** — admin オリジンに Route Handler/リライトを置き `/api/*` を Workers API へ転送。Cookie を host-only のまま admin 同一オリジン化でき dev でも動く（`localhost:3001/api → :8787`）。実装量は多め（認証フローも admin 経由になり得る）。
- **案B: クロスサブドメイン Cookie** — `apps/api/src/lib/auth.ts` に `advanced.crossSubDomainCookies = { enabled: true, domain: 'sz-lab.jp' }` ＋ `defaultCookieAttributes = { sameSite: 'none', secure: true }`。admin サーバーが `cookies()` で読めて転送可。ただし Cookie が全 `*.sz-lab.jp` に拡大（露出リスク）、`SameSite=None`（CSRF 面拡大、Better Auth の origin/CSRF＋CORS で緩和）、**localhost dev は別手当が必要**、当該ルートは動的レンダリング固定。

決定後、閲覧系（dashboard/stats）の初回データをサーバー取得＋`<Suspense>` でストリーミング。検索/フィルタ/ミューテーション/詳細シートはクライアントのままのハイブリッド。`cookies()` 利用で動的化するため PPR の恩恵は限定的（per-user で全動的）。dev/prod の差異とセッションローテーション（Set-Cookie 伝播）に注意。本サブプロジェクトは独立 spec で詳細化する。

---

## 5. 参照

- リサーチ全文（4 スレッド: ppr-caching / loading-suspense / auth-ssr-feasibility / admin-audit）: ワークフロー `admin-nextjs-modernization-research` の出力。
- 本番ドメイン（同一親 `sz-lab.jp`・同サイト別オリジン）はメモリ管理（Public 禁止）。
