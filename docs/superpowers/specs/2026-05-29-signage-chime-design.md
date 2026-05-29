# サイネージ＋チャイム アプリ（`apps/signage`）設計

- 作成日: 2026-05-29
- ステータス: 設計合意済み（実装計画はこの後に作成）
- 関連: `docs/architecture.md`（拡張ロードマップに本アプリを追記予定）

---

## 背景・目的（Context）

会場（tec-nova Nagasaki）の大型モニターに常時表示する**デジタルサイネージ兼チャイム**アプリを新設する。
現状、サイネージ／チャイム／大型モニターは `requirements.md` / `mvp.md` / `architecture.md` のいずれにも記載がなく、本アプリは**新規スコープ**である。

会場運用は「**活動50分 → 休憩10分**」のリズムで進む（例: 9:00–9:50 活動 / 9:50–10:00 休憩 / 10:00 再開 …）。
このリズムの区切りを**チャイム**で知らせ、普段は**動画を流し**つつ、時間が近づくと**シームレスに画面を切り替える**ことで、子どもと運営の双方に「いまは活動／休憩」「次の区切りまであと何分」を直感的に伝える。

狙う成果：
- 区切りの合図（チャイム）と視覚表示を自動化し、運営の手間と「時間を見失う」事故を減らす。
- 動画で会場の雰囲気をつくる（ウェルカム・空気づくり）。
- 既存プラットフォームの**チェックインデータ**を稼働シグナルに使い、無人でも「今日・このタームが稼働中か」を正しく判定する。

---

## スコープ

### v1 に含む
- 動画フルスクリーン再生（ループ・プレイリスト）＋常時表示の情報バー（**レイアウト L2**）。
- **50/10サイクル**に連動した状態遷移（活動↔休憩↔待機）と**シームレスなクロスフェード**。
- **チャイム**（Web Audio 合成、種別ごとに音色を変える）。
- **在館人数のライブ表示**（個人情報なし）と、**ターム最初のチェックインで稼働開始**するデータ駆動ロジック。
- 休憩中画面は**「再開まで M:SS」のカウントダウンを主役**に。
- 営業時間外・昼休みの**待機（ロゴ）画面**。
- キオスク運用（フルスクリーン・横向き・スリープ防止・起動時タップで音声解放）。

### v1 に含まない（将来拡張）
- admin での動画CMS（アップロード・並べ替え）。
- ニックネーム表示（v1は人数のみ）。
- 任意時刻のカスタムアナウンス登録。
- YouTube/Vimeo 埋め込み（v1は HTML5 `<video>` のみ）。
- WebSocket/SSE などのプッシュ（v1はポーリング）。

---

## 全体像

```
[大型モニター] ── Chrome キオスク ──> apps/signage (Next.js 16, 公開・認証なし)
                                         │  ~15–30s ポーリング
                                         ▼
                          GET /public/signage/today  (Hono on Workers, 認証外・PII非含有)
                                         │  既存 sessions/events を集計再利用
                                         ▼
                                    Cloudflare D1

時刻ロジック: packages/shared/activity-cycle.ts （venue-schedule.ts の TERMS を50/10に展開）
```

- **時刻の刻み**（活動/休憩/チャイム時刻）は端末のローカル時計から純粋ロジックで算出。
- **稼働判定**（鳴らす／表示するか）は API のターム別チェックイン数で決定（クロックとデータの役割分離）。
- **音声解放**は起動時の1回タップ（ブラウザの自動再生制約）。稼働判定とは独立。

---

## 1. 新規アプリ `apps/signage`（`apps/checkin` 規約を踏襲）

Next.js 16.2.4 / React 19.2.4。`pnpm-workspace.yaml` の `apps/*` グロブで**自動的にワークスペースに含まれる**（編集不要）。turbo も `dev`/`build`/`type-check` を自動でファンアウト。Biome lint はルートから走るため**アプリ単位の lint スクリプトは不要**。

**dev ポート: 3002**（api=8787 / checkin=3000 / admin=3001）。

作成ファイル（`apps/checkin` から複製し、差分のみ調整）：

| ファイル | 内容 / checkin との差分 |
|---|---|
| `package.json` | `name: "signage"`、scripts `dev: next dev --port 3002` ほか `build`/`start`/`type-check`。deps は checkin から **`@zxing/browser` と `better-auth` を除外**（公開・QR不要）、`motion` は維持。 |
| `next.config.ts` | checkin と同一（`transpilePackages: ['@tecnova/shared','@tecnova/ui']`）。 |
| `tsconfig.json` | checkin と同一（`paths` の `@/*` と `@tecnova/ui/*` 両方を含む）。 |
| `postcss.config.mjs` | `export { default } from '@tecnova/ui/postcss.config';`（同一）。 |
| `components.json` | checkin と同一（`style: radix-maia`、css は `packages/ui/.../globals.css`）。 |
| `.gitignore` | checkin から複製（`.next/`・`.env*`・`next-env.d.ts` 等）。 |
| `src/app/layout.tsx` | `LINE_Seed_JP` ＋ `@tecnova/ui/globals.css`。**`AppShell`（＝`MeProvider`）は使わず** `{children}` を直接描画。`viewport` でズーム無効、`metadata`/`appleWebApp` 設定。 |
| `src/app/manifest.ts` | **`display: 'fullscreen'`・`orientation: 'landscape'`**（checkin は standalone/portrait）。 |
| `src/app/page.tsx` | サイネージ本体（クライアントコンポーネント、状態機械のルート）。 |
| `CLAUDE.md` / `AGENTS.md` | checkin/admin と同様に複製。dev 3002・横向きフルスクリーン・**公開（`MeProvider`/`useMe`/`better-auth` なし）** を明記。 |

**認証なし**：`useMe()` を呼ばず `MeProvider` で包まない（呼ぶと throw する）。データ取得は `@tecnova/ui` の `apiJson`/`apiFetch` を流用（`credentials:'include'` は固定だが公開エンドポイントは無視するので無害）。`NEXT_PUBLIC_API_URL` 未設定時は `http://localhost:8787` にフォールバック。

> 本番でクロスオリジンに API を叩く場合、公開エンドポイントは専用の緩い CORS（後述）で対応するため `TRUSTED_ORIGINS` への追加は不要。

---

## 2. 画面の状態機械（state machine）

### 状態
| 状態 | 条件 | 画面（L2） |
|---|---|---|
| **boot** | 初回ロード〜起動タップ前 | 全画面「▶ タップして開始」オーバーレイ（背後でミュート動画が再生） |
| **idle** | ターム外（昼休み・営業時間外） **または** ターム内だが当該タームが未稼働 | **待機・ロゴ画面**（ロゴ＋時計＋「次は HH:MM から」/「まもなく開始」）、動画停止 |
| **activity** | ターム内・稼働中・活動フェーズ（:00–:50） | **動画フルスクリーン** ＋ 上部情報バー（ターム・時計・「休憩まであと◯分」・在館◯人） |
| **break** | ターム内・稼働中・休憩フェーズ（:50–:00） | **「休憩中／再開まで M:SS」を主役**（時計・在館数は小さく添える） |

### 稼働判定（データ駆動）
- **稼働開始 = 現タームの `terms[term].checkedIn > 0`**（API から取得、累計なので一度立てば**ターム終了まで sticky**）。
- ターム内でも `checkedIn === 0` の間は **idle（まもなく開始）**。チャイムも鳴らさない。
- これにより「土日=朝＋昼のみ稼働／平日=夕方のみ」「非稼働日は無音」が**曜日ルールなしで自動成立**。
- 端末の現タームは `classifyCycleMoment(now)` の `term` で判定。
- **9:00（や各タームの :00 開始）チャイムは基本鳴らない**（その時刻はまだ `checkedIn===0` のことが多い）。意味のある **:50 休憩 / :00 再開 / ターム終了** チャイムは初チェックイン後に発火。

### 遷移
- フェーズ境界（`:50` → break / `:00` → activity / ターム終了 → idle）で**クロスフェード**（不透明度のみ、`<video>` はアンマウントしない＝再読込フラッシュ防止）。
- `prefers-reduced-motion` 尊重：トランジションを実質ゼロ（〜1ms）に縮約（プロジェクトのモーション方針 [[project_checkin_motion]] に整合）。
- API 不達時の degrade：直近取得値をキャッシュし、**稼働済みなら時計駆動で継続／未稼働なら安全側で idle 維持**。

---

## 3. スケジュール＆チャイム（`packages/shared/src/activity-cycle.ts` 新規）

`venue-schedule.ts` の `TERMS` を import し、各ターム（180分）を **`ACTIVITY_MINUTES=50` + `BREAK_MINUTES=10` = 60分 × 3サイクル**に割る純粋ロジック。Workers安全（Intl のみ・Node API なし）、JST 固定 UTC+9。`venue-schedule.ts` と同じ subpath エクスポート方針（**root barrel には入れない**、`package.json` exports に `"./activity-cycle"` を追加）。

```ts
export const ACTIVITY_MINUTES = 50;
export const BREAK_MINUTES = 10;            // CYCLE = 60

export type CyclePhase = 'activity' | 'break' | 'idle';
export interface CycleMoment {
  phase: CyclePhase;
  term: TermId | null;
  cycleIndex: number | null;   // 1..3
  phaseEndsAt: Date | null;    // 次の境界 instant
}
export type ChimeKind = 'resume' | 'break' | 'term-end';
export interface ChimeEvent { kind: ChimeKind; term: TermId; at: Date; key: string; }

export const classifyCycleMoment = (instant: Date): CycleMoment => { /* ... */ };
export const cycleChimeEventsForDay = (instant: Date): ChimeEvent[] => { /* ... */ };
export const msUntilNextBoundary = (instant: Date): number | null => { /* ... */ };
export const secondsUntilNextBoundary = (instant: Date): number | null => { /* ... */ };
```

実装方針（`venue-schedule.ts` のスタイルに整合）：ターム内 `offset = current - termStart`（0..179）、`cycleIndex = floor(offset/60)+1`、`withinCycle = offset%60`、`phase = withinCycle < 50 ? 'activity' : 'break'`。境界 instant は `termEndInstant` と同じ `new Date(Date.UTC(y, m-1, d, jstHour-9, jstMin, 0, 0))` パターン。`key = `${toJstDateString}#${term}#${kind}#${HH:mm}`` でクライアント dedupe。

**朝ターム 9:00–12:00 のイベント列（検証済み・3サイクルちょうど）:**

| JST | フェーズ | 画面 | 境界イベント |
|---|---|---|---|
| 09:00–09:50 | activity | 動画 | `resume`@09:00（≒開始、通常未発火） |
| 09:50–10:00 | break | 休憩カウントダウン | `break`@09:50 |
| 10:00–10:50 | activity | 動画 | `resume`@10:00 |
| 10:50–11:00 | break | 休憩 | `break`@10:50 |
| 11:00–11:50 | activity | 動画 | `resume`@11:00 |
| 11:50–12:00 | break | 休憩 | `break`@11:50 |
| 12:00 | idle | 待機 | `term-end`@12:00 |

→ 1ターム = `resume`×3 + `break`×3 + `term-end`×1 = **7イベント**。昼・夕方も同形。

### チャイム（Web Audio 合成）
- 単一の `AudioContext` を遅延生成し、**起動タップ内で `resume()`**。`OscillatorNode → GainNode` の指数エンベロープ（`exponentialRampToValueAtTime`、0 ではなく 0.0001 へ）でベル風に。
- **種別で音色を変える**：再開＝二音上行、休憩＝二音下行（キンコン）、ターム終了＝やや長め——など `kind → (周波数, 波形, 長さ)` のマップ。
- `visibilitychange`→visible で `ctx.state !== 'running'` なら再 `resume()`（OSスリープ後の suspended 対策）。コンテキストはチャイム毎に作らず使い回す。

### スケジューラ（ドリフトしない自己補正型）
- `setInterval` は使わない。**毎tick `Date.now()` から次境界までの遅延を再計算する `setTimeout`**（最大〜1秒キャップ）。
- `cycleChimeEventsForDay(now)` を保持し、「前回 instant < `event.at` ≤ 今 instant」で境界跨ぎ検出 → `key` で dedupe（焦点復帰時の二重発火防止）。
- 発火は**稼働中の時のみ**（その時点で当該ターム `checkedIn > 0`）。`visibilitychange`→visible で即時 `tick()`。

---

## 4. ライブデータ（公開エンドポイント・在館人数のみ）

### エンドポイント
`GET /public/signage/today` → 認証外・PII非含有。

```jsonc
{
  "date": "YYYY-MM-DD",          // JST
  "currentlyPresent": 23,        // checkedOutAt === null の件数
  "totalCheckedIn": 58,          // 当日の延べセッション数
  "terms": {                     // checkedInAt の属するタームで累計（30分ルールは適用しない）
    "morning":   { "checkedIn": 30 },
    "afternoon": { "checkedIn": 28 },
    "evening":   { "checkedIn": 0 }
  }
}
```

### 配線（`apps/api`）
- **`apps/api/src/routes/public.ts`（新規）**：`publicRoute.get('/signage/today', ...)`。`/health` と同じ「認証ミドルウェア対象外パス」方式。`'/public'` は `'/api/*'`・`'/checkin/*'` のどちらにも一致しないため `requireAuthenticatedMentor` に**捕まらない**。
- **`apps/api/src/lib/public.ts`（新規）**：`fetchSignageToday(db)`。`lib/admin.ts` の `fetchSessionsForEvent` を踏襲。当日は `toJstDateString(new Date())`、`events` を `date` で引き、無ければ `date`＋ゼロを返す。セッションは**PII不要なので participants を join せず** `checkedInAt`/`checkedOutAt` のみ取得し、`classifyTerm(checkedInAt)`（`classifyVisit` ではなく＝30分ルール非適用）でターム別に加算。`currentlyPresent` は `checkedOutAt === null`。
- **`apps/api/src/index.ts`（変更）**：
  ```ts
  app.use('/public/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] })); // 資格情報なしの緩いCORS
  app.route('/public', publicRoute);   // app.route('/', healthRoute) の直前
  ```
  既存の `apiCors`（`credentials:true` + `TRUSTED_ORIGINS` 限定）は**流用しない**（`origin:'*'` と `credentials:true` は併用不可）。

### スキーマ
- **`packages/shared/src/schemas/public.ts`（新規）** に `signageTodayResponseSchema` ＋ `SignageTodayResponse` 型。`schemas/index.ts` に `export * from './public';` を追加（公開契約として admin/checkin と分離）。フロントは `@tecnova/shared/schemas` から import しレスポンスを型アサート。

### フロント取得
- `apiJson<SignageTodayResponse>('/public/signage/today')` を ~15–30秒間隔でポーリング（活動境界の検出は時計側が担うため、データ遅延は稼働判定の数十秒ラグのみで許容）。

---

## 5. 動画（設定リスト管理）

- **`apps/signage/src/config/playlist.ts`**：`export const PLAYLIST: { src: string; type?: string }[] = [...]`。self-host/CDN の URL を列挙し、**リポジトリにバイナリを置かない**。差し替えは設定変更＋再デプロイ。
- v1 は HTML5 `<video>` をループ＋プレイリスト順送り。`playsInline`、起動前は `muted` 自動再生（許容）、タップで `muted=false`。
- 将来：env / リモート設定 / YouTube 埋め込みへ拡張可能な型設計にしておく。

---

## 6. キオスク／ブラウザ制約・ブートシーケンス

ブラウザの自動再生・スリープ・全画面制約に対応する。**2層**で堅牢化：アプリ層（どこでも動く1回タップ）＋キオスク層（管理端末の起動フラグ）。

**ブートシーケンス（タップ1回で全解放）:**
1. ロード時はミュートで「▶ タップして開始」全画面オーバーレイ。
2. タップハンドラ（1つのジェスチャ内で）：`ctx.resume()` → `requestFullscreen()` → `video.muted=false; video.play()` → `requestWakeLock()` → スケジューラ開始。
3. `visibilitychange`→visible：`ctx.resume()` 再実行・wake lock 再取得・即時 `tick()`。

**個別制約:**
- **自動再生**：`navigator.getAutoplayPolicy?.('mediaelement')` で判定。`play()` の `NotAllowedError` は muted フォールバック。React では `muted` を**ref/effect で DOM に反映**（JSX prop だけだと不確実）。一度のジェスチャでページ寿命中は sticky activation。
- **Screen Wake Lock**：`navigator.wakeLock.request('screen')`。**hidden で自動解放されるため `visibilitychange` で再取得**。HTTPS 必須。OS 側のスクリーンブランク無効化も併用（API 単独に依存しない）。
- **全画面/横向き/カーソル/スクロール**：本番は Chromium を `--kiosk --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0` で起動（自動再生は enterprise policy `AutoplayAllowed` がより確実）。横向き・カーソル非表示・スリープ無効は **OS/ディスプレイ層**で固定。CSS は `html,body { height:100%; overflow:hidden; overscroll-behavior:none; touch-action:none; }`、タッチ専用なら `cursor:none`。
- 主要参照は本ドキュメント末尾の出典（MDN/Chrome for Developers 等）。

---

## 7. 作成・変更するファイル一覧

**新規（packages/shared）**
- `packages/shared/src/activity-cycle.ts`
- `packages/shared/src/schemas/public.ts`

**変更（packages/shared）**
- `packages/shared/package.json` … exports に `"./activity-cycle": "./src/activity-cycle.ts"`
- `packages/shared/src/schemas/index.ts` … `export * from './public';`

**新規（apps/api）**
- `apps/api/src/routes/public.ts`
- `apps/api/src/lib/public.ts`

**変更（apps/api）**
- `apps/api/src/index.ts` … `/public/*` の緩い CORS ＋ `app.route('/public', publicRoute)`

**新規（apps/signage、すべて）**
- 設定: `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- アプリ: `src/app/layout.tsx` / `src/app/page.tsx` / `src/app/manifest.ts`
- コンポーネント（目安）: `src/components/{tap-to-start,stage,info-bar,break-screen,idle-screen}.tsx`
- ロジック（目安）: `src/lib/{chimes,use-chime-scheduler,use-wake-lock,use-signage-data}.ts`
- 設定: `src/config/playlist.ts`
- ドキュメント: `CLAUDE.md` / `AGENTS.md`

**ドキュメント（フォロー）**
- `docs/architecture.md` のクライアント一覧／拡張ロードマップに `apps/signage` を追記。

---

## 8. 検証方法（end-to-end）

1. **共有ロジック**：`activity-cycle.ts` に単体テスト（境界値）。朝/昼/夕の各タームで `classifyCycleMoment` のフェーズ遷移、`cycleChimeEventsForDay` が 7×（稼働ターム数）件・時系列順・正しい JST instant、`msUntilNextBoundary` の符号と null（活動なし日）を検証。`pnpm --filter @tecnova/shared test`（無ければ vitest を最小導入）。
2. **API**：ローカル D1 にセッションを投入し `curl http://localhost:8787/public/signage/today` で `terms.*.checkedIn`・`currentlyPresent`・`totalCheckedIn`・空イベント日のゼロ応答を確認。`requireAuthenticatedMentor` に**捕まらない**こと（401 にならない）を確認。CORS ヘッダ（`access-control-allow-origin: *`）を確認。
3. **フロント結合**：`pnpm --filter signage dev`（:3002）。デバッグ用に「現在時刻を上書き」できる仕組み（クエリ `?now=2026-05-30T09:49:30+09:00` 等）を入れ、:50/:00 のクロスフェードとチャイム発火、稼働前 idle→初チェックインで activity への切替を確認。`prefers-reduced-motion` でトランジション縮約を確認。
4. **キオスク確認**：実機 or Chrome で「タップして開始」後に音付き動画・wake lock・全画面が効くこと、タブ復帰で音声が戻ることを確認。
5. `pnpm type-check` ／ `pnpm biome check .` 通過。

---

## 9. リスク・留意点・要確認

- **端末ローカル時計依存**：チャイム時刻は端末時計が正しい前提。キオスク端末は NTP 同期推奨。
- **稼働判定の数十秒ラグ**：初チェックインから次ポーリングまで最大ポーリング間隔分、activity 化が遅れうる。:50 直前の初チェックインは当該休憩チャイムを逃す可能性（許容）。
- **同一日に一部タームのみ稼働**（例：土曜は朝のみ）：未稼働タームは `checkedIn===0` のまま idle ＝ 自動で無音。問題なし。
- **off-hours セッションの扱い**：`classifyTerm` が `null`（昼休み・時間外）のチェックインは `terms` 集計から除外、`totalCheckedIn` には含む（表示用）。この区分で良いか最終確認。
- **公開エンドポイントの露出**：在館人数（数値のみ・PIIなし）を無認証公開する。ニックネーム等は返さない設計を維持する。
- **自動再生フラグの不安定さ**：`--autoplay-policy` は一部 Chrome ビルドで無視されるため、enterprise policy ＋ アプリ内タップの二重化で担保。

---

## 付録：主要参照ファイル（既存・再利用元）

- `apps/api/src/index.ts`（ルート登録順・CORS・認証 mount）
- `apps/api/src/middleware/{auth,cors}.ts`（`createDb`・`requireAuthenticatedMentor`・`apiCors`＝流用しない）
- `apps/api/src/lib/admin.ts`（`fetchSessionsForEvent` L46-103・`fetchParticipationSummary` L132-183・`todayInJst` L40）
- `apps/api/src/routes/health.ts`（公開ルートの先例）
- `packages/shared/src/venue-schedule.ts`（`TERMS`・`classifyTerm`・`termEndInstant`・`toJstWallClock`・`toJstDateString`）
- `packages/shared/src/schemas/{index,admin}.ts`（スキーマ／型のスタイル）
- `apps/checkin/*`（スキャフォルド複製元：`package.json`・`next.config.ts`・`tsconfig.json`・`postcss.config.mjs`・`components.json`・`src/app/{layout,manifest}.ts(x)`）
- `packages/ui/src/lib/{api-client,format,utils}.ts`（`apiJson`/`apiFetch`・JST整形・`cn`）

### 出典（ブラウザ制約・2025–2026）
- Autoplay guide — MDN / Chrome for Developers / Chromium project
- OscillatorNode・Advanced techniques (Web Audio) — MDN
- Screen Wake Lock API — Chrome for Developers / MDN / caniuse
- Accurate timers in JS（self-correcting setTimeout / Web Worker）— SitePoint / HackWild
- View Transitions・`<ViewTransition>`・prefers-reduced-motion — Chrome for Developers / React / MDN
- Chromium kiosk mode — Smartupworld / OSTechNix
