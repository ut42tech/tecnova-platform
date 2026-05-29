# checkin リデザイン設計書

- 日付: 2026-05-29
- 対象アプリ: `apps/checkin`（受付端末 / iPad PWA）
- ステータス: 設計（実装前レビュー待ち）

---

## 1. 背景と目的

`apps/checkin` の参加者プロフィール画面（`/reception/participants/[id]`）は直近のコミット
（`efd0aed` / `790aaf5` / `49ea36f`）で **motion + Cohesive Elevation** の演出が施され、アプリ内の
「仕上がりの基準線」になっている。一方で **それ以外の 7 画面は構造・配色は揃っているが演出が無い**：

- すべてフラットな `bg-sky-50`（プロフィールの `from-sky-50 to-white` グラデーション地ではない）
- 入場モーションがゼロ（カードもリストも静的に出る）
- 数値が静的（カウントアップ無し）、リストにスタッガー無し
- ガイドラインの進捗バーは固定幅、スライドはハード切り替え
- 「マニュアル入力」アイコンが `IconBug`（`page.tsx:217` / `manual/page.tsx:106`）＝置き去りのプレースホルダ

**目的**: プロフィール画面の演出語彙を残り 7 画面へ展開し、アプリ全体を一つの製品として統一する。
さらに高インパクトな画面には 1 つずつ「シグネチャーモーメント」を与え、統一感に加えて体験の質を引き上げる。

方針はブレインストーミングで合意済み：**「統一の土台 + シグネチャーモーメント」**。

---

## 2. スコープ

### 対象（7 画面）

`/`（Home / QR スキャナ）、`/login`、`/manual`、`/first-time`、`/guideline`、`/history`、`/settings`

### 対象外（回帰させない）

- **プロフィール画面** `/reception/participants/[id]` — 基準線。視覚は変更しない。
  - ただし新設の共有プリミティブ（`Reveal` 等）への **無風リファクタ**（見た目を一切変えない差し替え）は任意。
    本リデザインでは原則手を入れず、安全に確認できる範囲で別途検討する。
- **`AppShell`（共通ヘッダ）** `src/components/app-shell.tsx` — 全画面（プロフィール含む）を包むため、
  視覚回帰を避ける。変更するとしても加算的・中立的なものに限る。

### 非対象（YAGNI）

- 装飾的な背景テクスチャ・モチーフ（ブループリント/ドット/グロー/メッシュ等）は **入れない**。
  土台はグラデーション地とカードのみ。演出とレイアウトで格上げする（ユーザー判断: "Keep it flat"）。
- 新しい API・データモデルの追加は無し（既存エンドポイント・スキーマのまま）。

---

## 3. デザイン原則（基準線 = プロフィール画面）

1. **地** は `bg-gradient-to-b from-sky-50 to-white`（全対象画面に統一）。エラー画面は従来どおり `bg-rose-50`。
2. **カード** は `border-sky-200 shadow-sm`、見出しは既存 `PanelHeader`（tone 付き丸アイコン + `text-3xl` タイトル）。
3. **トーン体系**（既存を踏襲）: emerald=成功/滞在中、sky=情報/主要、amber=警告/チェックアウト、rose=危険、slate=中立。
4. **モーションは必ず `useReducedMotion()` でゲート**。reduced 時は `initial={false}` で即表示し、ループ演出は止める。
5. **タッチ前提のサイズ**（`h-14`/`h-16`/`h-20`、`text-xl`〜`text-2xl`）と `tabular-nums` を維持。
6. 演出は **transform/opacity のみ**（GPU 合成、レイアウトスラッシュ回避）。

---

## 4. 共有プリミティブ（新規追加）

すべて `apps/checkin/src/components/`（既存 `AnimatedNumber`/`PanelHeader`/`ResultSummaryCard` と同居の checkin ローカル）。
複数アプリで必要になったら `packages/ui` へ昇格する（現時点ではミニマム優先で昇格しない）。

| ファイル | 役割 | 備考 |
|---|---|---|
| `src/lib/motion.ts` | モーション定数・variant ファクトリを 1 箇所に集約 | 値は §5。reduced-motion 判定は各コンポーネント側 |
| `src/components/reveal.tsx` | `<Reveal index>` フェードアップ入場ラッパ | reduced 時は素の要素。`index` でスタッガー。`as`/`className` 可 |
| `src/components/stat-tile.tsx` | ラベル + 数値タイル（`rounded-lg border bg-white p-4`） | `tone`/`icon` 任意。数値は `AnimatedNumber` 連携可 |
| `src/components/live-dot.tsx` | 滞在中を示す脈動ドット | `active` で emerald 脈動 / slate 静止。reduced 対応 |
| `src/components/page-shell.tsx` | グラデーション地の `<main>` 既定 | `className` で上書き可。中央寄せ等はオプション |
| `src/components/scan-reticle.tsx` | Home の QR スキャン演出（静的な角ブラケット） | アニメーションなし（走査線はユーザー判断で不採用） |
| `src/components/segmented-control.tsx` | Manual のモード切替（スライドする選択インジケータ） | `motion` の `layoutId` でスライド。reduced 時は即切替 |

> Next.js 16 / React 19 / `motion`（`motion/react`）は既に利用中。`AGENTS.md` のとおり、App Router 系 API を触る箇所は
> 実装前に `node_modules/next/dist/docs/` を確認する。

---

## 5. モーション契約（`src/lib/motion.ts`）

| 名前 | 値 | 用途 |
|---|---|---|
| `reveal(index)` | `initial {opacity:0, y:12}` → `animate {opacity:1, y:0}`、`{duration:0.4, ease:'easeOut', delay: index*0.06}` | カード/セクションの入場（プロフィールと同値） |
| `tap` | `whileTap {scale:0.97}` | 主要ボタンの押下フィードバック |
| `pop(index)` | `initial {opacity:0, scale:0.6}` → `{opacity:1, scale:1}`、`{duration:0.25, ease:'easeOut', delay: min(index*0.012, 0.5)}` | タイル/小要素のポップ（プロフィール来場ヒートマップと同値） |
| `listItem(index)` | フェードアップ + 大きめスタッガー（`delay: min(index*0.04, 0.4)`） | 検索結果・候補・履歴行 |
| `slide(direction)` | `AnimatePresence` で `x: ±40, opacity:0` の方向付き出入り | ガイドラインのスライド遷移。reduced 時はクロスフェード/即時 |

すべて reduced-motion 時は無効化（即表示・ループ停止）。

---

## 6. 画面ごとの設計

各画面共通: 地をグラデーションへ、ルート直下を `Reveal` でスタッガー入場、主要ボタンに `tap`、カードは `border-sky-200 shadow-sm`。
以下は「土台 + シグネチャー + 個別修正」。

### 6.1 Home `/`（ディレクションスライス）

- 土台: グラデーション地。右の 3 アクションカードを `Reveal` で順次入場。
- **シグネチャー: QR スキャン演出**。映像枠にスキャン対象を示す静的な角ブラケット（`ScanReticle`）。
  検出→遷移中のオーバーレイ（ID 表示）も合わせて磨く。走査線アニメーションはユーザー判断で不採用（アニメーションを持たない）。
- 個別修正: 「マニュアル入力」カードの `IconBug` → `IconKeyboard`（`page.tsx:217`）。

### 6.2 Guideline `/guideline`（ショーケース）

- 土台: グラデーション地、既存のスライド別トーン体系を維持。
- **シグネチャー: スライド体験の作り込み**。
  - `AnimatePresence` による **方向付きスライド遷移**（次へ=左へ送り、前へ=右へ戻す）。
  - 進捗バーの **幅アニメーション**（現状は固定幅）。
  - アイコンの軽いポップ入場、最後の同意ステップにささやかな達成感の強調。
  - **キーボード矢印**（←/→）でのスライド送り対応。
- reduced 時はスライドをクロスフェード or 即時、進捗は即反映。

### 6.3 Login `/login`

- 土台: グラデーション地、入場モーション。Google ボタンに `tap`。
- **シグネチャー: 温かいウェルカムヒーロー**。TECNOVA ロゴ + やさしい見出し + 余白設計で「最初に見る画面」を歓迎的に。
  装飾背景は無し（フラット指定）。レイアウトとロゴ、モーションで魅せる。

### 6.4 Manual `/manual`

- 土台: グラデーション地、入場モーション。
- **シグネチャー: モード切替の作り込み**。`SegmentedControl` のスライドする選択インジケータ + ID/名前パネルのクロスフェード。
  ID 入力の押下感、検索結果は `listItem` でスタッガー。
- 個別修正: ID パネルの `IconBug` → `IconKeyboard`（`manual/page.tsx:106`）。

### 6.5 History `/history`

- 土台: グラデーション地、入場モーション。
- **シグネチャー: 生きているダッシュボード**。サマリ 3 数値を `AnimatedNumber` 化、「滞在中」に `LiveDot`（脈動）。
  テーブル行 / 空状態を磨き、`StatTile` で集計カードを統一。

### 6.6 First-time `/first-time`

- 土台: グラデーション地、入場モーション。
- **シグネチャー**: 登録ステップ（1-2-3）と候補グリッドをスタッガー入場、未登録人数バッジを `AnimatedNumber`、候補カードの押下感。

### 6.7 Settings `/settings`

- 土台: グラデーション地、入場モーション。
- **シグネチャー: メンターのアイデンティティカード**。素の歯車見出しの代わりに、アバター + 名前 + ロールバッジのヘッダ。控えめだが統一感。

---

## 7. 触らないもの・回帰防止

- プロフィール画面・`AppShell` ヘッダは視覚回帰させない（§2）。
- 既存の状態機械・データ取得・`apiFetch`・Zod 型アサートは変更しない（演出と見た目のレイヤのみ）。
- `ResultSummaryCard` は emerald/amber トーンの完了画面で使われ続ける。必要なら入場モーションのみ加算。

---

## 8. 制約

- **Next.js 16 / React 19**: App Router API を触る箇所は実装前に `node_modules/next/dist/docs/` を確認（`AGENTS.md`）。
- **a11y**: reduced-motion ゲート必須、ガイドラインはキーボード操作、`aria-label`/フォーカス可視を維持、明るい環境向けの十分なコントラスト。
- **コード規約**: TypeScript strict、`any` 禁止、arrow function、import は先頭集約、Biome（2 スペース / セミコロン / シングルクォート）。
- **パフォーマンス**: transform/opacity のみで演出、装飾画像を増やさない（フラット）。`motion` の既存利用に倣う。

---

## 9. 作業順序とディレクションスライス

1. 共有プリミティブ（`motion.ts` / `Reveal` / `StatTile` / `LiveDot` / `PageShell`）を先に用意。
2. **Home を実機で動くディレクションスライスとして実装** → ユーザーが起動して見た目・モーション感を承認。
3. 承認後、確定した語彙を残り 6 画面へ展開（**Guideline を 2 番目** = ショーケース、続いて Login/Manual/History/First-time/Settings）。
4. ultracode 方針に従い、展開フェーズは並列ワークフローで実行し、**デザイン整合性の敵対的レビュー**を通す。

---

## 10. 検証方法

フロント視覚タスクのため自動テストは限定的。各段階で以下を満たす：

- `pnpm type-check` と `pnpm biome check`（lint/format）がパス。
- `pnpm --filter checkin dev` で各画面を起動し、見た目・モーション・reduced-motion（OS 設定）を目視確認。
- 主要ブレークポイント（iPad 縦/横、`sm`/`lg`）でレイアウト崩れが無いこと。
- プロフィール画面と `AppShell` に視覚回帰が無いこと。
