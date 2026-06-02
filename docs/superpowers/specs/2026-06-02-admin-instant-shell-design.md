# Sub-project 2: 耐障害性＋即時インタラクティブシェル 設計

作成日: 2026-06-02 / 親spec: [`2026-06-02-admin-data-layer-modernization-design.md`](./2026-06-02-admin-data-layer-modernization-design.md)
ブランチ: `feat/admin-resilience-shell`（`refactor/admin-data-layer` から分岐 → PR は develop）

## 0. ゴールと選択

ユーザー選択 = **フル即時インタラクティブシェル**。admin のコールドロードで、サイドバー等のクロームを**即描画**し、ユーザー依存部（ロール別ナビ・アカウント名）だけスケルトンにして `/api/me` 解決後に埋める。加えて `error.tsx`（描画クラッシュの安全網）と `loading.tsx`（ナビ時のコンテンツスケルトン）を追加する。

**コスト/リスクの正直な評価:** これは内部向け管理画面で「クロームが ~100–200ms 早く出る」ための変更で、`MeProvider`（**3アプリ共有**）の契約に手を入れる。便益は限定的・リスクは中。ユーザーは最小案（推奨）よりこちらを明示選択済み。後方互換を保ち、3アプリすべてを検証して安全に着地させる。

## 1. 中核設計: `MeProvider`（状態のみ）＋ `MeGate`（ゲート）に分離

現状の `MeProvider` は「/api/me 取得 ＋ 解決まで全体をスケルトンでゲート ＋ ok のとき context 提供」を一手に担う。これを分離する（`packages/ui/src/components/me-provider.tsx`）。

```ts
export type MeState =
  | { status: 'loading' }
  | { status: 'ok'; me: Me }
  | { status: 'forbidden'; message: string }
  | { status: 'error'; message: string };
```

- **`MeProvider`**: /api/me を取得し、401 は `window.location.replace(loginPath)`。**常に** children を `<MeStateContext.Provider value={state}>` で包む（ゲートしない・フォールバックを描画しない）。props: `loginPath?`（既定 `/login`）。
- **`useMeState(): MeState`**: クローム用（me が null のときも扱える）。
- **`useMe(): Me`**: 従来どおり non-null の `Me` を返す。status が ok でなければ throw（＝ `MeGate` の内側でのみ使う前提。既存の content 消費者はすべてゲート内なので安全）。
- **`MeGate`**: status==='ok' のときだけ children を描画。loading/forbidden/error は従来 `MeProvider` が持っていたフォールバックを描画。props: `forbiddenMessage?`, `loadingClassName?`, `forbiddenClassName?`, `errorClassName?`, `loadingFallback?`（任意の ReactNode。指定時は loadingClassName より優先＝admin はシェル型スケルトンも渡せる）。

**後方互換:** 旧 `<MeProvider {...fallbackProps}>{app}</MeProvider>` は `<MeProvider><MeGate {...fallbackProps}>{app}</MeGate></MeProvider>` に置換するだけで**完全に同じ挙動**になる。`useMe()` のシグネチャは不変。

## 2. checkin / signage 移行（挙動を完全維持）

両アプリは `MeProvider` を「全体ゲート」として使用（signage は `useMe` 0、checkin は settings で 1）。フォールバック系 props を `MeGate` へ移すだけ。

- checkin `apps/checkin/src/components/app-shell.tsx`: `<MeProvider><MeGate forbiddenMessage=... loadingClassName=... forbiddenClassName=... errorClassName=...><Chrome>{children}</Chrome></MeGate></MeProvider>`（Chrome は従来どおりゲート内＝挙動不変）。
- signage `apps/signage/src/components/app-shell.tsx`: 同様に `<MeProvider><MeGate ...>{children}</MeGate></MeProvider>`。
- checkin settings の `useMe()` はゲート内なので不変。

## 3. admin 即時シェル

`apps/admin/src/app/(authed)/layout.tsx`:

```tsx
<MeProvider>
  <AppShell>
    <MeGate forbiddenMessage="この画面は管理者のみ利用できます">{children}</MeGate>
  </AppShell>
  <Toaster richColors position="top-right" />
</MeProvider>
```

- `AppShell` は**常に**描画（コールドロード中もクローム可視）。ページ本文だけ `MeGate` でゲート。
- 以下を `useMe()` → `useMeState()` に変更し、status!=='ok' の間はスケルトン表示:
  - `sidebar.tsx`: ナビ一覧＝プレースホルダ行（ロール未確定のため実項目は出さない）、フッターのアカウント＝スケルトン。ブランドロゴ（`BrandLogo`）は me 不要なので即表示。アクティブピル/layoutId は ok 後。
  - `bottom-nav.tsx`: タブ＝スケルトン（モバイル）。
  - `mobile-top-bar.tsx`: アカウントボタン＝スケルトン。ロゴは即表示。
  - `account-menu.tsx`: me が無い間はトリガをスケルトンにし、メニュー自体は ok 後のみ。
- ナビは `visibleNavItems(role)` がロール必須なので、ok までスケルトン → ok で実ナビに差し替え。
- content（mentors/pre-registrations 含む）の `useMe()` は `MeGate` 内なので不変。

## 4. error.tsx（描画クラッシュの安全網）

- `apps/admin/src/app/(authed)/error.tsx`（`'use client'` 必須）: `DataError`（SP1）を再利用＋「再試行」(`reset()`)。
- `apps/admin/src/app/error.tsx`（root, `'use client'`）: 同様の最小フォールバック。
- これは現状の per-page try/catch では拾えない**描画時 throw** を拾う。

## 5. loading.tsx（ナビ時のコンテンツスケルトン）

即時シェル化により layout（AppShell）はナビ間で永続するため、`(authed)/loading.tsx` はコンテンツスロットのスケルトンとして意味を持つ（ソフトナビ時に AppShell を保ったまま本文だけスケルトン）。汎用のコンテンツスケルトン（リスト/サマリ風）を 1 つ用意して充てる。

## 6. 非ゴール / 注意

- `cacheComponents`/PPR は無効のまま。
- `useOptimistic` は今回見送り（別途・任意）。
- セッション 401 の遷移は `MeProvider` に残す（副作用は 1 箇所）。
- 検証は **3 アプリすべて**: admin（Playwright で即時シェル＝ローディング中にサイドバー骨格が見える／ok で実ナビ・アカウント／forbidden・error・コンテンツ）、checkin・signage（少なくとも描画＋ゲート挙動が不変なこと）。type-check は admin / @tecnova/ui / checkin / signage、biome は変更ファイル全部。

## 7. ファイル構成

- 変更（shared）: `packages/ui/src/components/me-provider.tsx`（分離。`MeGate`/`useMeState` を追加、`useMe` は維持）
- 変更（checkin）: `apps/checkin/src/components/app-shell.tsx`
- 変更（signage）: `apps/signage/src/components/app-shell.tsx`
- 変更（admin）: `(authed)/layout.tsx`, `components/{sidebar,bottom-nav,mobile-top-bar,account-menu,app-shell}.tsx`
- 新規（admin）: `app/(authed)/error.tsx`, `app/error.tsx`, `app/(authed)/loading.tsx`（＋必要ならコンテンツスケルトン）
