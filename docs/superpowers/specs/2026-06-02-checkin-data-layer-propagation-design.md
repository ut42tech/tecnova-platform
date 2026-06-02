# checkin データ層伝播 設計（useApiResource 展開）

作成日: 2026-06-02 / 対象: `apps/checkin`（共有: `packages/ui` の `useApiResource` を利用）/ Next.js 16 + React 19

## 0. 背景とゴール

admin データ層モダナイゼーション（`docs/superpowers/specs/2026-06-02-admin-data-layer-modernization-design.md` の SP1）で `packages/ui` に `useApiResource` / `DataError` / `EmptyState` を導入した。本サブプロジェクトは、その **ロジック層（`useApiResource`）** を checkin の読み取り取得に展開し、5 箇所の手書き fetch ステートマシン（`useEffect` + `apiFetch` + `type State` + cancellation）の重複を解消する。

**プレゼンテーションは checkin 独自の全画面キオスク UX（motion 付き）を維持** し、admin 向け inline プリミティブ（`DataError` / `EmptyState`）は持ち込まない（ユーザー判断: 「ロジック共通化＋checkin 独自 UI」）。

### 実コード精査で判明した重要点（設計の根拠）

1. **loading スケルトンは各ページのレイアウトを写した content-aware skeleton**（first-time / history / reception / guideline で形が異なる Card+Skeleton グリッド、manual は 3 件のリスト skeleton）。1 コンポーネントに無理に統合すると content-aware なローディング UX が退化する → **ページ固有のスケルトンは維持**。
2. **empty 状態は文脈ごとに形が異なる**（first-time: inline Alert / history: 中央 icon 円+太字 / manual: dashed-border テキスト）。低重複なので **原則維持**。
3. **真の高価値統合は 2 つ**: (a) `useApiResource` による fetch ロジック共通化（5 箇所）、(b) ほぼ同一の **全画面 ErrorScreen 4 箇所**（first-time / history / reception / guideline）を checkin-local 共有コンポーネント 1 つへ。
4. **`cache: 'no-store'` は不要になる**。API（`apps/api/src`）は Cache-Control 系ヘッダを一切送っておらず、freshness 情報がないためブラウザは毎回再検証する。admin の `useApiResource`（ライブな `/api/sessions` ダッシュボード）が client 側 `no-store` 無しで既に正しく動作していることがこれを裏付ける。よって checkin の明示的 `cache:'no-store'` は移行時に **削除して良い**（フックに cache オプションを足さない＝minimum first）。
5. **`useApiResource` のキャンセルは `cancelled` フラグ**（AbortController ではない）。manual 検索を移行すると in-flight リクエストのネットワーク中断は無くなるが、最新クエリ優先の **UX は同一**（古いレスポンスは破棄）。

## 1. スコープ

### 1.1 `useApiResource` へ移行する GET 5 箇所

| # | ファイル | path | enabled | reload | 移行の要点 |
|---|---------|------|---------|--------|-----------|
| 1 | `app/first-time/page.tsx` | `'/checkin/pre-registered'` | 常時 (true) | retry ボタン → `reload()` | クリーン移行。`type State` / `useCallback(loadParticipants)` を撤去し `state.kind` で分岐。`state.kind==='ok'` の `data.participants` を使う。 |
| 2 | `app/history/page.tsx` | `'/checkin/history/today'` | 常時 | retry → `reload()` | GET のみ移行。**60s タイマー（`nowMs` 再計算）は別 `useEffect` として残す**。bulk-checkout（POST）と `lastResult`/`error`/`isSubmitting` は現状維持。`cache:'no-store'` は削除。 |
| 3 | `app/reception/participants/[id]/page.tsx` | `` `/checkin/participants/${participantId}` `` | `!!participantId` | （なし） | **複合ステート分離**: fetch は `useApiResource`（loading\|ok\|error）。`submitting`/`result`（attendance POST 後）は別 `useState` に切り出す。`cache:'no-store'` 削除。 |
| 4 | `app/manual/page.tsx` | `` debouncedQuery ? `/checkin/participants/search?${new URLSearchParams({ q: debouncedQuery })}` : null `` | （path=null で idle） | （なし） | debounce(300ms) はページに残し、結果の path を `useApiResource` に渡す。**AbortController を撤去** しフックの cancelled-flag に委譲（UX 同一）。空クエリ → path=null → idle。 |
| 5 | `app/guideline/page.tsx` | `'/checkin/pre-registered'` | `!!preRegistrationId` | retry → `reload()` | list 取得後にページ側で `participants.find(p => p.preRegistrationId === preRegistrationId)` を実行。見つからなければ **派生エラー**（ErrorScreen 表示）。`preRegistrationId` 無し（enabled=false→idle）は ErrorScreen「登録する人を選んでください。」を表示。`activating`/`result`（activate POST）は別 `useState`。 |

共通方針:
- `useApiResource` は hooks ルールに従い **無条件で呼ぶ**。条件分岐（param ゲート）は `enabled` で表現。
- エラーメッセージは `useApiResource` が `apiErrorMessage`（`body.message ?? body.error ?? HTTP <status>`）で生成。現行 `readErrorMessage`（`body.message ?? HTTP <status>`）とほぼ等価で表示文言は維持される。
- 各ページの fetch 用 `type State` / fetch 用 `useEffect` / `useCallback(load)` を撤去する（重複解消の検証ポイント）。

### 1.2 共有 ErrorScreen（checkin-local 新規）

`apps/checkin/src/components/screen-error.tsx`:

```tsx
import { Alert, AlertDescription, AlertTitle } from '@tecnova/ui/components/alert';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

// checkin の全画面エラー（キオスク用）。bg-rose-50 の全画面 + destructive Alert。
// ページ固有のボタンを actions に、任意の補足（ID 行 / 詳細カード）を footer に渡す。
export function CheckinErrorScreen({
  title,
  message,
  actions,
  footer,
}: {
  title: string; // 例: 一覧を表示できません / 履歴を表示できません
  message: string; // 取得エラーメッセージ
  actions: ReactNode; // ページ固有のボタン群（Home / 再読み込み / 選び直す 等、h-16 text-xl）
  footer?: ReactNode; // 任意: reception の ID 行 / guideline の ParticipantDetails 等
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

- first-time / history / reception / guideline の全画面 ErrorScreen 4 コピー（各 ~20-25 行）を本コンポーネントへ集約。各ページは固有のボタンを `actions` に、固有の補足（ID 行 / 詳細カード）を `footer` に渡す。
- guideline の現行 `ErrorScreen` は `onRetry` の有無でボタンが変わる（再読み込み or ホーム）。この分岐は **呼び出し側** で `actions` を組み立てて表現する（コンポーネントは分岐を持たない）。
- **manual の inline error**（`SearchResults` 内の小さな destructive Alert、全画面でない）は対象外＝現状維持。
- import パス（`@tecnova/ui/components/alert` 等）は実装時に既存ページの import 文で確認して合わせる。

### 1.3 loading / empty は原則ページ固有のまま（過度な統合をしない）

- content-aware スケルトンと多様な empty 状態は各ページに残す（§0 の根拠）。
- 例外（任意・実装時判断）: `PageShell` + `Card` の足場が複数ページで共通なため、薄いラッパに切り出す価値があれば検討して良いが、**スケルトンの中身はページに残す**。統合自体を目的化しない（minimum first）。

## 2. 非ゴール / 不変条件

- POST/mutation（`/checkin/history/check-out-bulk` / `/checkin/activate` / attendance）は変更しない（`useApiResource` は読み取り専用）。
- **signage は対象外**。4 つのフック（health 30s / playlist 5min / previous-summary 1h / live counts 20s）はすべて polling + silent-degrade で `useApiResource` 非対応。現状が正しい。
- admin の inline `DataError` / `EmptyState` は checkin に持ち込まない。
- エンドポイント・debounce(300ms)・ルーティング・motion・キオスク UX・表示文言は不変。
- `useApiResource` のシグネチャは変更しない（cache オプション等を足さない）。

## 3. 実装上の注意（落とし穴）

- **複合ステートの分離（#3 reception, #5 guideline）**: fetch 状態（`useApiResource`）と mutation/workflow 状態（`submitting`/`result`/`activating`）を別管理にする。`state.kind === 'ok'` で取得完了データを得て、その後のユーザー操作は独立した `useState` で進める。`result`（ScanResponse）表示中はデータ/エラー画面を出さない、という現行の画面遷移を保つ。
- **派生状態（#5 guideline, #4 manual）**: `useApiResource` の状態に加え、ページ側で派生を計算する（guideline: list から find → not-found を派生エラーに; manual: 空クエリ → path=null → idle）。
- **enabled=false の表示**: guideline で `preRegistrationId` 無し → idle。現行は error「登録する人を選んでください。」を出すので、idle のときに同文言の ErrorScreen を出す分岐をページに置く。
- **reload の配線**: 現行 retry ボタンの `onClick={() => void loadParticipants()}` を `onClick={reload}` に置換。

## 4. デリバリ・検証

- **依存**: PR #43（`useApiResource` 等）は **`develop` へマージ済み**（`develop` @ `39d969b`）。本ブランチ `refactor/checkin-data-layer` は最新 `develop` から分岐済みで、`useApiResource` を直接利用できる。**実装はすぐ着手可能**。
- **ブランチ/PR**: 単一 `refactor/checkin-data-layer` → `develop` に 1 本の PR（**スタックしない**。#40-43 のスタック誤マージ＝兄弟ブランチ同士でマージされ develop に届かなかった反省を踏まえる）。
- **コミット**: 論理単位で分割（spec → 共有 `CheckinErrorScreen` 追加 → 各ページ移行を数コミット）。
- **検証**:
  - `pnpm --filter checkin --filter @tecnova/ui type-check` green。
  - `pnpm biome check apps/checkin/src` green。
  - Playwright（`/api/me` + 各 GET をモック）で 5 フローの load / error / retry / empty、manual の idle/検索/空、reception/guideline の取得後の操作（POST）が従来どおり動くことを確認。特に `reload()` / 画面遷移後に **最新データが返る** こと（no-store 削除の影響確認）。
  - 各ページから手書き fetch ステートマシン（`type State` の fetch 部分 / fetch 用 `useEffect`）が消えていること。

## 5. 参照

- 親設計: `docs/superpowers/specs/2026-06-02-admin-data-layer-modernization-design.md`
- フック: `packages/ui/src/hooks/use-api-resource.ts`（#43 で develop に追加済み）/ クライアント: `packages/ui/src/lib/api-client.ts`
- 認証は触らない方針（admin/API は同一親ドメインの同サイト兄弟 / SP3〔サーバー取得〕は意図的に見送り）。
