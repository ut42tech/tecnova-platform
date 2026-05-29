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

### 認証方針（決定事項）

サイネージは**他2アプリ（checkin/admin）と同じメンター・ホワイトリスト認証**（Better Auth + Google OAuth + `mentors` 許可リスト）にする。**公開（無認証）にはしない。**

- 理由：将来「チェックイン履歴ベースの情報」「メンター紹介スライド（氏名・写真・経歴）」などの**機微コンテンツ**を流す構想があるため、データ取得経路は最初からアクセス制御下に置く。「壁に映ること」と「APIを誰でも叩けること」は別問題で、後者を塞ぐ。
- 端末運用：**テクノバ共有の管理用 Google アカウント（`mentors` にメンターロールで登録済み）**でキオスク端末を1回ログインし、セッション（既定7日）で維持する。個人アカウントを使わず最小権限。
- 効果：v1 では**新規エンドポイントを作らず**、認証付きの既存 `GET /api/sessions/today` をそのまま再利用できる。将来の機微コンテンツも同じ許可リスト配下の `/api/*`（必要なら `/api/signage/*`）に足すだけで、**新しい認証機構は不要**。

---

## スコープ

### v1 に含む
- 動画フルスクリーン再生（ループ・プレイリスト）＋常時表示の情報バー（**レイアウト L2**）。
- **50/10サイクル**に連動した状態遷移（活動↔休憩↔待機）と**シームレスなクロスフェード**。
- **チャイム**（Web Audio 合成、種別ごとに音色を変える）。
- **在館人数のライブ表示**と、**ターム最初のチェックインで稼働開始**するデータ駆動ロジック（認証付き `GET /api/sessions/today` を再利用）。
- 休憩中画面は**「再開まで M:SS」のカウントダウンを主役**に。
- 営業時間外・昼休みの**待機（ロゴ）画面**。
- メンター・ホワイトリスト認証（checkin と同じログイン経路）。
- キオスク運用（フルスクリーン・横向き・スリープ防止・起動時タップで音声解放）。

### v1 に含まない（将来拡張・認証経路は確定済み）
- admin での動画CMS（アップロード・並べ替え）。
- ニックネーム表示・チェックイン履歴ベースの情報・メンター紹介スライド → **認証付き `/api/*` エンドポイントを追加**して対応（公開はしない）。
- 任意時刻のカスタムアナウンス登録。
- YouTube/Vimeo 埋め込み（v1は HTML5 `<video>` のみ）。
- WebSocket/SSE などのプッシュ（v1はポーリング）。

---

## 全体像

```
[大型モニター] ── Chrome キオスク ──> apps/signage (Next.js 16, 認証あり=メンター許可リスト)
        │ 共有管理アカウントで1回ログイン（セッション既定7日・cookie維持）
        ▼  ~15–30s ポーリング（credentials:'include'）
  GET /api/sessions/today  (Hono on Workers, requireAuthenticatedMentor)  ← 既存を再利用
        │  event/sessions/summary（term・isPresent 含む）を返す
        ▼
   Cloudflare D1

時刻ロジック: packages/shared/activity-cycle.ts （venue-schedule.ts の TERMS を50/10に展開）
```

- **時刻の刻み**（活動/休憩/チャイム時刻）は端末のローカル時計から純粋ロジックで算出。
- **稼働判定**（鳴らす／表示するか）は `/api/sessions/today` のターム別チェックイン数で決定（クロックとデータの役割分離）。
- **音声解放**は起動時の1回タップ（ブラウザの自動再生制約）。**ログイン**（共有アカウント）とは独立。

---

## 1. 新規アプリ `apps/signage`（`apps/checkin` 規約を踏襲・認証あり）

Next.js 16.2.4 / React 19.2.4。`pnpm-workspace.yaml` の `apps/*` グロブで**自動的にワークスペースに含まれる**（編集不要）。turbo も `dev`/`build`/`type-check` を自動でファンアウト。Biome lint はルートから走るため**アプリ単位の lint スクリプトは不要**。

**dev ポート: 3002**（api=8787 / checkin=3000 / admin=3001）。

作成ファイル（`apps/checkin` から複製し、差分のみ調整）：

| ファイル | 内容 / checkin との差分 |
|---|---|
| `package.json` | `name: "signage"`、scripts `dev: next dev --port 3002` ほか `build`/`start`/`type-check`。deps は checkin から **`@zxing/browser` を除外**（QR不要）、**`better-auth` と `motion` は維持**（ログイン経路＋表示アニメ）。 |
| `next.config.ts` | checkin と同一（`transpilePackages: ['@tecnova/shared','@tecnova/ui']`）。 |
| `tsconfig.json` | checkin と同一（`paths` の `@/*` と `@tecnova/ui/*` 両方を含む）。 |
| `postcss.config.mjs` | `export { default } from '@tecnova/ui/postcss.config';`（同一）。 |
| `components.json` | checkin と同一。 |
| `.gitignore` | checkin から複製（`.next/`・`.env*`・`next-env.d.ts` 等）。 |
| `src/lib/auth-client.ts` | checkin と同一（`createAuthClient({ baseURL: API_URL, fetchOptions:{credentials:'include'} })`、`better-auth/react`）。 |
| `src/app/login/page.tsx` | checkin と同一パターン（`authClient.signIn.social({ provider:'google', callbackURL, errorCallbackURL })`）。共有管理アカウントでログイン。 |
| `src/components/app-shell.tsx` | checkin パターン：`/login` 以外を `MeProvider` で包む（`forbiddenMessage` はサイネージ用文言）。サイネージ本体は MeProvider 配下に置く。 |
| `src/app/layout.tsx` | `LINE_Seed_JP` ＋ `@tecnova/ui/globals.css` ＋ `<AppShell>`。`viewport` でズーム無効、`metadata`/`appleWebApp` 設定。 |
| `src/app/manifest.ts` | **`display: 'fullscreen'`・`orientation: 'landscape'`**（checkin は standalone/portrait）。 |
| `src/app/page.tsx` | サイネージ本体（クライアントコンポーネント、状態機械のルート。MeProvider 配下なので `useMe()` 可）。 |
| `CLAUDE.md` / `AGENTS.md` | checkin/admin と同様に複製。dev 3002・横向きフルスクリーン・**認証あり（共有アカウント運用）** を明記。 |

データ取得は `@tecnova/ui` の `apiJson`/`apiFetch`（`credentials:'include'` 固定）で認証付き `/api/*` を叩く。`NEXT_PUBLIC_API_URL` 未設定時は `http://localhost:8787` にフォールバック。

**API側のコード変更は不要。設定のみ**：`TRUSTED_ORIGINS`（`apps/api` の `.dev.vars` / Wrangler Secrets）にサイネージのオリジンを追加（dev: `http://localhost:3002`、本番: サイネージ本番ドメイン）。`parseTrustedOrigins` 経由で **CORS と Better Auth trustedOrigins の両方**に効く（コード変更なし）。

---

## 2. 画面の状態機械（state machine）

### 状態
| 状態 | 条件 | 画面（L2） |
|---|---|---|
| **(login)** | 未ログイン（セッションなし・401） | `MeProvider` が `/login` へ。共有アカウントでログイン（通常は7日に1回程度） |
| **boot** | ログイン済み・初回ロード〜起動タップ前 | 全画面「▶ タップして開始」オーバーレイ（背後でミュート動画が再生） |
| **idle** | ターム外（昼休み・営業時間外） **または** ターム内だが当該タームが未稼働 | **待機・ロゴ画面**（ロゴ＋時計＋「次は HH:MM から」/「まもなく開始」）、動画停止 |
| **activity** | ターム内・稼働中・活動フェーズ（:00–:50） | **動画フルスクリーン** ＋ 上部情報バー（ターム・時計・「休憩まであと◯分」・在館◯人） |
| **break** | ターム内・稼働中・休憩フェーズ（:50–:00） | **「休憩中／再開まで M:SS」を主役**（時計・在館数は小さく添える） |

### 稼働判定（データ駆動・`/api/sessions/today` 由来）
- レスポンスの `sessions[]`（当日全セッション、`term` 付き）から **現タームの件数（`sessions.filter(s => s.term === currentTerm).length`）> 0 で稼働中**。セッションはチェックアウトしても消えない（`checkedOutAt` が付くだけ）ため**累計＝ターム終了まで sticky**。
- 在館数は `summary.currentlyPresent`、当日延べは `summary.totalCheckedIn` をそのまま表示。
- ターム内でも現タームが未稼働の間は **idle（まもなく開始）**。チャイムも鳴らさない。
- これにより「土日=朝＋昼のみ稼働／平日=夕方のみ」「非稼働日は無音」が**曜日ルールなしで自動成立**。
- 端末の現タームは `classifyCycleMoment(now)` の `term` で判定。
- **9:00（や各タームの :00 開始）チャイムは基本鳴らない**（その時刻はまだ件数0のことが多い）。意味のある **:50 休憩 / :00 再開 / ターム終了** チャイムは初チェックイン後に発火。

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
- 発火は**稼働中の時のみ**（その時点で当該タームの件数 > 0）。`visibilitychange`→visible で即時 `tick()`。

---

## 4. ライブデータ（認証付き既存エンドポイントの再利用）

**新規エンドポイントは作らない。** サイネージは認証済みの信頼端末なので、既存の `GET /api/sessions/today`（`requireAuthenticatedMentor`／admin ロール不要・メンターで可）を再利用する。

レスポンス（`todaySessionsResponseSchema`、`@tecnova/shared/schemas`）には次が含まれ、サイネージに必要なものはすべて揃っている：
- `event: { id, date } | null`（当日イベント未作成なら null＋ゼロサマリ）
- `sessions[]`：各 `term: 'morning'|'afternoon'|'evening'|null`、`isPresent`、`checkedInAt` ほか
- `summary: { totalCheckedIn, currentlyPresent, checkedOut }`

サイネージ側の導出：
- **ターム別 checkedIn**：`sessions` を `term` でカウント（稼働判定に使用）。
- **在館数**：`summary.currentlyPresent`。**当日延べ**：`summary.totalCheckedIn`。

取得は `apiJson<TodaySessionsResponse>('/api/sessions/today')` を ~15–30秒間隔でポーリング（活動境界の検出は時計側が担うため、データ遅延は稼働判定の数十秒ラグのみで許容）。`fullName`/`nickname` 等の PII も返るが、認証済み信頼クライアント（admin と同等の信頼レベル）であり v1 は画面に出さない。将来 PII を絞った専用 `/api/signage/*` を足す余地は残す。

**API 側の変更は設定のみ**：`TRUSTED_ORIGINS` にサイネージのオリジンを追加（CORS＋Better Auth 双方に反映、コード変更なし）。

---

## 5. 動画（設定リスト管理）

- **`apps/signage/src/config/playlist.ts`**：`export const PLAYLIST: { src: string; type?: string }[] = [...]`。self-host/CDN の URL を列挙し、**リポジトリにバイナリを置かない**。差し替えは設定変更＋再デプロイ。
- v1 は HTML5 `<video>` をループ＋プレイリスト順送り。`playsInline`、起動前は `muted` 自動再生（許容）、タップで `muted=false`。
- 将来：env / リモート設定 / YouTube 埋め込みへ拡張可能な型設計にしておく。

---

## 6. キオスク／ブラウザ制約・ブートシーケンス

ブラウザの自動再生・スリープ・全画面制約に対応する。**2層**で堅牢化：アプリ層（どこでも動く1回タップ）＋キオスク層（管理端末の起動フラグ）。

**ブートシーケンス:**
0. （初回／セッション切れ時のみ）`MeProvider` が `/login` を表示 → 共有管理アカウントで Google ログイン。以降はセッション cookie で維持（既定7日）。
1. ログイン済みでロードすると、ミュートで「▶ タップして開始」全画面オーバーレイ（背後でミュート動画）。
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

**変更（packages/shared）**
- `packages/shared/package.json` … exports に `"./activity-cycle": "./src/activity-cycle.ts"`

**変更（apps/api）— コードなし・設定のみ**
- `apps/api/.dev.vars`（ローカル）／ Wrangler Secrets（本番）の `TRUSTED_ORIGINS` にサイネージのオリジンを追加。
- `.env.example` の `TRUSTED_ORIGINS` 例コメントを更新（任意）。

**新規（apps/signage、すべて）**
- 設定: `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- 認証: `src/lib/auth-client.ts` / `src/app/login/page.tsx` / `src/components/app-shell.tsx`（MeProvider ラッパ）
- アプリ: `src/app/layout.tsx` / `src/app/page.tsx` / `src/app/manifest.ts`
- コンポーネント（目安）: `src/components/{tap-to-start,stage,info-bar,break-screen,idle-screen}.tsx`
- ロジック（目安）: `src/lib/{chimes,use-chime-scheduler,use-wake-lock,use-signage-data}.ts`
- 設定: `src/config/playlist.ts`
- ドキュメント: `CLAUDE.md` / `AGENTS.md`

**ドキュメント（フォロー）**
- `docs/architecture.md` のクライアント一覧／拡張ロードマップに `apps/signage`（認証あり）を追記。

---

## 8. 検証方法（end-to-end）

1. **共有ロジック**：`activity-cycle.ts` に単体テスト（境界値）。朝/昼/夕の各タームで `classifyCycleMoment` のフェーズ遷移、`cycleChimeEventsForDay` が 7×（稼働ターム数）件・時系列順・正しい JST instant、`msUntilNextBoundary` の符号と null（活動なし日）を検証。`pnpm --filter @tecnova/shared test`（無ければ vitest を最小導入）。
2. **認証＆データ**：`apps/api` の `TRUSTED_ORIGINS` に `http://localhost:3002` を追加。共有（or 任意のメンター）アカウントでログイン後、ブラウザから `/api/sessions/today` が 200 で取得でき、`sessions[].term`・`summary.currentlyPresent/totalCheckedIn` が返ることを確認。未ログインだと `MeProvider` が `/login` に飛ばすこと、ログイン後にサイネージが表示されることを確認。
3. **フロント結合**：`pnpm --filter signage dev`（:3002）。デバッグ用に「現在時刻を上書き」できる仕組み（クエリ `?now=2026-05-30T09:49:30+09:00` 等）を入れ、:50/:00 のクロスフェードとチャイム発火、稼働前 idle→初チェックインで activity への切替を確認。`prefers-reduced-motion` でトランジション縮約を確認。
4. **キオスク確認**：実機 or Chrome で「タップして開始」後に音付き動画・wake lock・全画面が効くこと、タブ復帰で音声が戻ることを確認。セッション維持（再読込でログイン不要）を確認。
5. `pnpm type-check` ／ `pnpm biome check .` 通過。

---

## 9. リスク・留意点・要確認

- **端末ローカル時計依存**：チャイム時刻は端末時計が正しい前提。キオスク端末は NTP 同期推奨。
- **セッション期限（既定7日）**：長期イベントではキオスクが再ログインを要する。必要なら `apps/api/src/lib/auth.ts` の `betterAuth({ session: { expiresIn } })` で延長（小さなコード変更）。会場運用上「数日に一度ログインし直す」で許容できるかを確認。
- **稼働判定の数十秒ラグ**：初チェックインから次ポーリングまで最大ポーリング間隔分、activity 化が遅れうる。:50 直前の初チェックインは当該休憩チャイムを逃す可能性（許容）。
- **同一日に一部タームのみ稼働**（例：土曜は朝のみ）：未稼働タームは件数0のまま idle ＝ 自動で無音。問題なし。
- **共有アカウントの運用**：壁の端末に共有メンターアカウントのログイン状態が乗る。最小権限（メンターロール）で運用し、漏洩時は当該アカウントの無効化／セッション失効で対応。
- **PII の取り扱い**：v1 は `/api/sessions/today` の PII を画面に出さない。将来ニックネーム等を出す場合も、認証経路は維持しつつ表示内容を設計で限定する。
- **自動再生フラグの不安定さ**：`--autoplay-policy` は一部 Chrome ビルドで無視されるため、enterprise policy ＋ アプリ内タップの二重化で担保。

---

## 付録：主要参照ファイル（既存・再利用元）

- `apps/api/src/index.ts`（ルート登録順・CORS・認証 mount）
- `apps/api/src/middleware/{auth,cors}.ts`（`requireAuthenticatedMentor`・`createDb`・`apiCors`・`parseTrustedOrigins`）
- `apps/api/src/lib/auth.ts`（Better Auth 設定・`trustedOrigins`・セッション）
- `apps/api/src/routes/admin.ts`（`/me` L25-32・`/sessions/today` L37・`fetchTodaySessions`）
- `apps/api/src/lib/admin.ts`（`fetchSessionsForEvent`・`todayInJst`）
- `packages/shared/src/venue-schedule.ts`（`TERMS`・`classifyTerm`・`termEndInstant`・`toJstWallClock`・`toJstDateString`）
- `packages/shared/src/schemas/{index,admin}.ts`（`todaySessionsResponseSchema` ＝ `term`/`summary` を含む）
- `apps/checkin/*`（スキャフォルド＆認証複製元：`package.json`・`next.config.ts`・`tsconfig.json`・`postcss.config.mjs`・`components.json`・`src/lib/auth-client.ts`・`src/app/login/page.tsx`・`src/components/app-shell.tsx`・`src/app/{layout,manifest}.ts(x)`）
- `packages/ui/src/components/me-provider.tsx`（`MeProvider`・`useMe`・401→`/login`）
- `packages/ui/src/lib/{api-client,format,utils}.ts`（`apiJson`/`apiFetch`・JST整形・`cn`）

### 出典（ブラウザ制約・2025–2026）
- Autoplay guide — MDN / Chrome for Developers / Chromium project
- OscillatorNode・Advanced techniques (Web Audio) — MDN
- Screen Wake Lock API — Chrome for Developers / MDN / caniuse
- Accurate timers in JS（self-correcting setTimeout / Web Worker）— SitePoint / HackWild
- View Transitions・`<ViewTransition>`・prefers-reduced-motion — Chrome for Developers / React / MDN
- Chromium kiosk mode — Smartupworld / OSTechNix
