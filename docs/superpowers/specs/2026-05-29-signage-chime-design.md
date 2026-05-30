# サイネージ＋チャイム アプリ（`apps/signage`）設計

- 作成日: 2026-05-29
- 改訂: 2026-05-30 — 動画レイヤを self-host HTML5 `<video>` から **YouTube（IFrame Player API 自前キュー ＋ YouTube Data API）** に変更。BGMは **無音トグル ＋ OS側 Spotify**（アプリ非統合）。チャイム／サイクル／認証／`/api/sessions/today` ポーリングは不変。
- 改訂: 2026-05-30 — **L2レイアウトを「配信（ブロードキャスト）風」に刷新**。「全画面動画＋上部情報バー」から、**縮小した動画パネル＋右レーン（チャイムの役割＝次チャイムまでのカウントダウン）＋下部の巡回インフォメーション（lower-third）**へ。休憩/待機はパネル上にスライドをクロスフェード。世界観は checkin に統一（sky→white・LINE Seed JP・motion + reduced-motion 尊重）。**状態機械・チャイム・サイクル・稼働判定・データ経路は不変**（§2の状態機械は同じ／画面の見せ方のみ変更）。にぎわい表示は `packages/shared/src/attendance-level.ts` の純粋ロジックで来場者数から算出。
- ステータス: 設計合意済み（実装計画はこの後に更新）
- 関連: `docs/architecture.md`（拡張ロードマップに本アプリを追記予定）

---

## 改訂サマリ（2026-05-30）

初版（2026-05-29）は動画を **self-host の HTML5 `<video>`** で流す前提だった。運用上の都合（動画素材をYouTubeで管理したい・差し替えを非開発者でも回したい）から、動画レイヤを以下に置き換える。**それ以外（チャイム・50/10サイクル・状態機械・認証・在館/稼働判定）は初版のまま。**

- **動画ソース**：YouTube。再生順は **YouTube上のプレイリスト**で管理し、Worker の新規エンドポイント `GET /api/signage/playlist` が YouTube Data API v3 で順序付き動画ID列を返す（§4・§5）。
- **再生方式**：**自前キュー**（IFrame Player API。`ENDED` で次IDへ `loadVideoById`）。YouTube標準の関連動画グリッド・終了画面・「次の動画」UIを実質抑止する（§5）。
- **広告の現実**：埋め込み側は所有しない動画の広告を消せない。広告ゼロを確実にできるのは **YPP加入チャンネルで収益化オフにした自前動画** のみ（§5・§9）。混在運用前提。
- **音声**：アプリは Spotify に一切触れない。**無音／音ありのグローバルトグル（既定=無音）**だけ持ち、無音時は動画をミュート。BGMは **キオスク端末のOS側 Spotify**（アプリ／Connect）が担当（§5.5）。

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
- 効果：稼働判定・在館数は認証付きの既存 `GET /api/sessions/today` をそのまま再利用する。動画プレイリスト取得のため `GET /api/signage/playlist` を1本だけ新設するが（§4）、これも**同じ `requireAuthenticatedMentor` 配下**に置くため**新しい認証機構は不要**（CORS/Better Auth は `TRUSTED_ORIGINS` 設定のみで効く）。将来の機微コンテンツ（ニックネーム表示・メンター紹介スライド等）も同じ許可リスト配下の `/api/signage/*` に足すだけでよい。

---

## スコープ

### v1 に含む
- **YouTube動画のフルスクリーン再生**（IFrame Player API・自前キュー）＋常時表示の情報バー（**レイアウト L2**）。
- 再生順は **YouTube上のプレイリスト**で管理し、`GET /api/signage/playlist`（Data API）から順序付き動画ID列を取得（§4・§5）。
- **無音／音ありのグローバルトグル（既定=無音）**。無音時は動画ミュート＝映像のみ。BGMは **OS側 Spotify**（アプリ非統合、§5.5）。
- **50/10サイクル**に連動した状態遷移（活動↔休憩↔待機）と**シームレスなクロスフェード**。
- **チャイム**（Web Audio 合成、種別ごとに音色を変える）。
- **在館人数のライブ表示**と、**ターム最初のチェックインで稼働開始**するデータ駆動ロジック（認証付き `GET /api/sessions/today` を再利用）。
- 休憩中画面は**「再開まで M:SS」のカウントダウンを主役**に。
- 営業時間外・昼休みの**待機（ロゴ）画面**。
- メンター・ホワイトリスト認証（checkin と同じログイン経路）。
- キオスク運用（フルスクリーン・横向き・スリープ防止・起動時タップで音声解放）。

### v1 に含まない（将来拡張・認証経路は確定済み）
- admin での動画CMS（プレイリストUI・並べ替え）。v1はYouTube側の画面でプレイリストを管理する。
- ニックネーム表示・チェックイン履歴ベースの情報・メンター紹介スライド → **認証付き `/api/signage/*` エンドポイントを追加**して対応（公開はしない）。
- **アプリ内 Spotify 制御**（Web Playback SDK・OAuth・再生中表示）→ OS側再生で代替。将来必要なら別途検討（§5.5）。
- **動画ごとの音あり/ミュート個別フラグ**、複数プレイリスト切替 → v1はグローバルトグル＋単一プレイリスト。
- self-host HTML5 `<video>` 方式 → YouTubeに一本化（広告ゼロを厳密に求める場合の代替として §9 に残す）。
- 任意時刻のカスタムアナウンス登録。
- WebSocket/SSE などのプッシュ（v1はポーリング）。

---

## 全体像

```
[大型モニター] ── Chrome キオスク ──> apps/signage (Next.js 16, 認証あり=メンター許可リスト)
   │  共有管理アカウントで1回ログイン（セッション既定7日・cookie維持）
   │  ├─ ~15–30s: GET /api/sessions/today      (requireAuthenticatedMentor) ← 既存再利用
   │  │              event/sessions/summary（term・isPresent 含む）→ 稼働判定・在館数
   │  └─ 起動時/~数分: GET /api/signage/playlist (requireAuthenticatedMentor) ← 新設
   │                   { items:[{videoId}], refreshAt }
   ▼  IFrame Player API（自前キュー: ENDED→loadVideoById）
  YouTube（埋め込みプレーヤー。動画はYouTube側にホスト）

  Hono on Workers ─┬─ D1（sessions/participants）
                   └─ YouTube Data API v3 playlistItems.list（APIキー・サーバ側キャッシュ）

  BGM（無音モード時）: キオスク端末の OS側 Spotify アプリ/Connect（アプリは非制御）
  時刻ロジック: packages/shared/activity-cycle.ts （venue-schedule.ts の TERMS を50/10に展開）
```

- **時刻の刻み**（活動/休憩/チャイム時刻）は端末のローカル時計から純粋ロジックで算出。
- **稼働判定**（鳴らす／表示するか）は `/api/sessions/today` のターム別チェックイン数で決定（クロックとデータの役割分離）。
- **再生順**は `/api/signage/playlist`（YouTube Data API 由来）で決定。プレーヤーへは自前キューで1本ずつ流す。
- **音声解放**は起動時の1回タップ（ブラウザの自動再生制約）。**ログイン**（共有アカウント）とは独立。**BGM（OS側Spotify）はアプリ管轄外**で常時鳴らせる。

---

## 1. 新規アプリ `apps/signage`（`apps/checkin` 規約を踏襲・認証あり）

Next.js 16.2.4 / React 19.2.4。`pnpm-workspace.yaml` の `apps/*` グロブで**自動的にワークスペースに含まれる**（編集不要）。turbo も `dev`/`build`/`type-check` を自動でファンアウト。Biome lint はルートから走るため**アプリ単位の lint スクリプトは不要**。

**dev ポート: 3002**（api=8787 / checkin=3000 / admin=3001）。

作成ファイル（`apps/checkin` から複製し、差分のみ調整）：

| ファイル | 内容 / checkin との差分 |
|---|---|
| `package.json` | `name: "signage"`、scripts `dev: next dev --port 3002` ほか `build`/`start`/`type-check`。deps は checkin から **`@zxing/browser` を除外**（QR不要）、**`better-auth` と `motion` は維持**（ログイン経路＋表示アニメ）。**動画は YouTube IFrame Player API を自前ラップ＝再生用の追加 npm 依存なし**。型のため `@types/youtube` のみ devDep に追加（`YT.Player` 等）。 |
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

**既存APIの再利用（`/api/sessions/today`）に必要なのは設定のみ**：`TRUSTED_ORIGINS`（`apps/api` の `.dev.vars` / Wrangler Secrets）にサイネージのオリジンを追加（dev: `http://localhost:3002`、本番: サイネージ本番ドメイン）。`parseTrustedOrigins` 経由で **CORS と Better Auth trustedOrigins の両方**に効く（既存ルートのコード変更なし）。**ただし動画プレイリスト用に `GET /api/signage/playlist` を新設するため、API 側にも新規コードが入る**（§5.1・§7）。

---

## 2. 画面の状態機械（state machine）

### 状態
| 状態 | 条件 | 画面（L2） |
|---|---|---|
| **(login)** | 未ログイン（セッションなし・401） | `MeProvider` が `/login` へ。共有アカウントでログイン（通常は7日に1回程度） |
| **boot** | ログイン済み・初回ロード〜起動タップ前 | 全画面「▶ タップして開始」オーバーレイ（背後でミュートの YouTube プレーヤーが再生） |
| **idle** | ターム外（昼休み・営業時間外） **または** ターム内だが当該タームが未稼働 | **待機・ロゴ画面**（ロゴ＋時計＋「次は HH:MM から」/「まもなく開始」）、`pauseVideo()` で動画停止 |
| **activity** | ターム内・稼働中・活動フェーズ（:00–:50） | **YouTube動画フルスクリーン** ＋ 上部情報バー（ターム・時計・「休憩まであと◯分」・在館◯人） |
| **break** | ターム内・稼働中・休憩フェーズ（:50–:00） | **「休憩中／再開まで M:SS」を主役**（時計・在館数は小さく添える） |

### 稼働判定（データ駆動・`/api/sessions/today` 由来）
- レスポンスの `sessions[]`（当日全セッション、`term` 付き）から **現タームの件数（`sessions.filter(s => s.term === currentTerm).length`）> 0 で稼働中**。セッションはチェックアウトしても消えない（`checkedOutAt` が付くだけ）ため**累計＝ターム終了まで sticky**。
- 在館数は `summary.currentlyPresent`、当日延べは `summary.totalCheckedIn` をそのまま表示。
- ターム内でも現タームが未稼働の間は **idle（まもなく開始）**。チャイムも鳴らさない。
- これにより「土日=朝＋昼のみ稼働／平日=夕方のみ」「非稼働日は無音」が**曜日ルールなしで自動成立**。
- 端末の現タームは `classifyCycleMoment(now)` の `term` で判定。
- **9:00（や各タームの :00 開始）チャイムは基本鳴らない**（その時刻はまだ件数0のことが多い）。意味のある **:50 休憩 / :00 再開 / ターム終了** チャイムは初チェックイン後に発火。

### 遷移
- フェーズ境界（`:50` → break / `:00` → activity / ターム終了 → idle）で**クロスフェード**（不透明度のみ、**YouTubeプレーヤー（iframe）はアンマウントしない**＝再読込フラッシュ防止）。break/idle では `pauseVideo()` で止め、activity 復帰で `playVideo()`／キュー継続。
- `prefers-reduced-motion` 尊重：トランジションを実質ゼロ（〜1ms）に縮約（プロジェクトのモーション方針 [[project_checkin_motion]] に整合）。
- API 不達時の degrade：直近取得値をキャッシュし、**稼働済みなら時計駆動で継続／未稼働なら安全側で idle 維持**。プレイリスト取得失敗時は直近キュー（またはフォールバックの動画ID）を保持。
- **BGM（OS側Spotify）はアプリの状態機械と独立**。break/idle でも止めず、雰囲気を維持できる（無音モード時）。音あり再生モードでは動画音声と二重になるため運用者が手動でOS音楽を止める前提（§5.5）。

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

## 4. ライブデータ（稼働判定・在館数：認証付き既存エンドポイントの再利用）

**稼働判定・在館数は新規エンドポイントを作らず**、既存の `GET /api/sessions/today`（`requireAuthenticatedMentor`／admin ロール不要・メンターで可）を再利用する。サイネージは認証済みの信頼端末。（動画プレイリスト取得のみ §5.1 で `GET /api/signage/playlist` を新設する。）

レスポンス（`todaySessionsResponseSchema`、`@tecnova/shared/schemas`）には次が含まれ、サイネージに必要なものはすべて揃っている：
- `event: { id, date } | null`（当日イベント未作成なら null＋ゼロサマリ）
- `sessions[]`：各 `term: 'morning'|'afternoon'|'evening'|null`、`isPresent`、`checkedInAt` ほか
- `summary: { totalCheckedIn, currentlyPresent, checkedOut }`

サイネージ側の導出：
- **ターム別 checkedIn**：`sessions` を `term` でカウント（稼働判定に使用）。
- **在館数**：`summary.currentlyPresent`。**当日延べ**：`summary.totalCheckedIn`。

取得は `apiJson<TodaySessionsResponse>('/api/sessions/today')` を ~15–30秒間隔でポーリング（活動境界の検出は時計側が担うため、データ遅延は稼働判定の数十秒ラグのみで許容）。`fullName`/`nickname` 等の PII も返るが、認証済み信頼クライアント（admin と同等の信頼レベル）であり v1 は画面に出さない。将来 PII を絞った専用 `/api/signage/*` を足す余地は残す。

**セッションAPIのコード変更は不要**（`TRUSTED_ORIGINS` にサイネージのオリジンを追加するのみ。CORS＋Better Auth 双方に反映）。ただし動画プレイリスト用に `GET /api/signage/playlist` を新設する（§5.1）。

---

## 5. 動画（YouTube・IFrame Player API 自前キュー）

### 5.1 プレイリストの管理元と取得（`GET /api/signage/playlist` 新設）

- 再生順は **YouTube上のプレイリスト**で管理する（追加・削除・並べ替えは YouTube の画面で完結。非開発者も更新可）。
- Worker に **`GET /api/signage/playlist`**（`requireAuthenticatedMentor`）を新設。YouTube Data API v3 `playlistItems.list` を **plain fetch ＋ APIキー**で叩き（OAuth不要・`googleapis` 不使用＝**Workers安全**。`packages/shared/src/google-sheets.ts` の fetch 流儀に倣うが **JWT は不要**、APIキーのみ）、順序付き動画ID列を返す。
  - リクエスト：`GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId={YOUTUBE_PLAYLIST_ID}&maxResults=50&key={YOUTUBE_API_KEY}`。50件超は `nextPageToken` でページング。順序は `snippet.position`（0始まり）でソート、`videoId` は canonical な `contentDetails.videoId` を使う（`snippet.resourceId.videoId` でも取れる）。**複数 part を要求してもクォータは増えない（1呼び出し＝1ユニットのまま）**。
  - フィルタ：**`status.privacyStatus` が `public`/`unlisted` 以外（`private`・`privacyStatusUnspecified`）と `videoId` 欠落（削除済み）を除外**。プレイリストに残った再生不能動画でキューが詰まるのを防ぐ。なお埋め込み禁止・地域制限など API では弾けない再生不能はクライアント側 `onError`（§5.2）で救済する。
  - コスト：`playlistItems.list` は **1呼び出し1ユニット／既定クォータ 1日1万ユニット** → 余裕。
  - キャッシュ：**Worker の module-scope 変数＋TTL（例 5分・`{ data, expiresAt }`）**で十分（Cache API は任意）。クォータ節約＋プレイリスト更新の反映遅延（数分）は許容。YouTube API Developer Policies III.E.4 の**保存上限30日**内なので数分キャッシュは問題なし。実装は `apps/api/src/lib/signage.ts::fetchSignagePlaylist(env)` に閉じる。
  - レスポンス（`@tecnova/shared/schemas` に `signagePlaylistResponseSchema` 新設）：`{ items: { videoId: string; title?: string }[]; refreshAt: string }`。
- Secrets（Worker）：`YOUTUBE_API_KEY`（**YouTube Data API 限定の「APIの制限」**を付与。サーバ側呼び出しでリファラが無いため**リファラ制限は使わない**）、`YOUTUBE_PLAYLIST_ID`。`apps/api/src/types.ts` の `Bindings` に追加。
- フロントは `use-playlist`（`apiJson<SignagePlaylistResponse>('/api/signage/playlist')` を起動時＋数分間隔でポーリング）が `videoId[]` の状態を保持し、自前キューに供給する。取得失敗／空配列のときは §5.4 のフォールバックIDを使う。

### 5.2 再生（IFrame Player API・自前キュー）

- `https://www.youtube.com/iframe_api` を**一度だけ**読み込み（モジュールスコープのシングルトン）、グローバル `onYouTubeIframeAPIReady` で `new YT.Player(el, {...})` を生成。React 19 / Next 16 では client-only な effect 内で生成し、**StrictMode の二重マウントをガード**、アンマウントで `player.destroy()`。これらは `use-youtube-player` フックに閉じ、状態機械へは**命令的ハンドル（`play()` / `pause()` / `loadNext()`）**を `ref` で公開する（§2 のフェーズ遷移から `phase === 'activity' ? play() : pause()` を呼ぶ）。
- **自前キュー**：`onStateChange` で `event.data === YT.PlayerState.ENDED (0)` を検知したら、次の `videoId` を `loadVideoById` で**即差し替え**。プレーヤーが自身の「終了状態」に落ち着かないため、YouTube標準の**「次の動画」/関連動画グリッド/up-next UI を実質抑止**できる。末尾まで来たらキュー先頭へループ。**再生不能動画の救済**：`onError`（`100`＝削除/非公開、`101`/`150`＝埋め込み禁止）でも次の `videoId` へ進める（ENDED を発火しない動画でキューが止まらないように）。
- `playerVars`：`controls:0, disablekb:1, fs:0, playsinline:1, iv_load_policy:3, autoplay:1, mute:1`。初期 `mute:1` はロード時のミュート自動再生を保証するためで、起動タップ後は `use-mute`（localStorage）状態に従って `player.mute()`/`player.unMute()` を**命令的に**呼んで上書きする（playerVars は生成時1回だけなので state では追従させない）。
  - ⚠️ **`rel=0` は 2018-09-25 以降「同一チャンネルの関連に限定」するだけで関連表示を完全には消せない**。**`modestbranding` は 2023-08-15 で廃止＝無効**。よって関連UIの抑止は**パラメータではなくキュー差し替え**に依存する（上記）。
  - ⚠️ **2種類の終了UIを区別する**：(1) 自前キューの **`ENDED` 直前の差し替え（残り〜1秒）でプレーヤーを「終了状態」に到達させない**ことで up-next/関連グリッドを抑止できる。(2) ただし**作者エンドスクリーン（カード）は末尾 5–20 秒に重なる**ため、サブ秒の差し替えでは消えない。これを隠すには **末尾数秒手前で切る**（`loadVideoById({ videoId, endSeconds: duration - 約6 })`、または `getCurrentTime`/`getDuration` 監視で数秒早く差し替え）。**作者カードの完全抑止は保証しない**（§9・許容）。

### 5.3 広告の現実（重要・ToS順守）

- **埋め込み側（本アプリ）は所有しない動画の広告を削除・スキップ・ブロックできない。** 広告の有無は**動画所有者の収益化設定**と Content ID 権利者が決め、埋め込みプレーヤーは youtube.com と同じ広告設定を継承する（＝広告を独自に無効化はできない。ただし**「同じ設定」＝「視聴ページと同頻度」ではない**点に注意。後述のとおり 2024-08 以降、埋め込みの広告頻度はむしろ増加傾向）。
- **IFrame API でプログラム的に広告をブロック／改変／置換／スキップするのは YouTube API Developer Policies III.I.5–6 違反。** 自前キュー（`loadVideoById`）にしても**収益化動画のプレロール広告は消えない**（広告は再生制御ではなく収益化状態で決まる）。
- **広告ゼロを確実にできるのは限定的**：
  - ✅ **YouTube Partner Program (YPP) 加入チャンネルで、その動画の収益化をオフ**にした **自前アップロード動画**（YouTube が公式に「広告非表示」と明言）。
  - ⚠️ **チャンネルが YPP 非加入**だと、ToS「収益化する権利」（2021-06-01〜）により **YouTube が自前動画にも独自広告を載せる権利を留保**しており、収益化オフにできず広告ゼロを保証できない。
  - ⚠️ **第三者動画**は Content ID クレームや所有者の収益化で広告が出うる。2024-08 以降、埋め込みプレーヤーの広告頻度は増加傾向。
- **運用方針（混在前提）**：自前(YPP・収益化オフ)動画＝クリーンに流れる枠、第三者動画＝広告が出うる前提で番組編成する。**広告を厳密にゼロにしたい時間帯のために self-host（§9 代替案）へ切り替える**選択肢を残す。

### 5.4 フォールバック設定

- `apps/signage/src/config/playlist.ts` は **`export const FALLBACK_VIDEO_IDS: string[] = [...]`**（動画IDの配列。旧版の `{ src }` URL 配列ではない）。`/api/signage/playlist` の取得失敗／空配列／ローカル開発時に `use-playlist` がこの配列を採用し、**API 結果と同じ自前キュー機構**に流す。本番の主たるソースは API。空＝フォールバックも空なら idle ロゴ画面に倒す。

---

## 5.5 音声／BGM（無音トグル ＋ OS側 Spotify・アプリ非統合）

- **方針**：アプリは Spotify に一切統合しない（Web Playback SDK／OAuth を持たない）。BGM は **キオスク端末の OS側 Spotify アプリ（または Spotify Connect の再生先）** が担当。「任意の Spotify プレイリスト」＝現場で Spotify アプリにキューしたもの。
  - 理由：ブラウザ内再生は Web Playback SDK＝**フル(デスクトップ)Premium ＋ OAuth（`streaming` スコープ）** が必須で重い。OS側再生なら今すぐ・確実に成立。
  - ⚠️ **広告ゼロの BGM には Spotify Premium が必須**（Free は曲間に音声広告）。OS側でも同じ＝端末の Spotify は **Premium 前提**。
- **アプリが持つのは無音トグルだけ**：`use-mute`（localStorage 永続・**既定=無音**）＋ 端末隅の控えめな小コントロール（運用者向け）。
  - **無音時**：`player.mute()`＝映像のみ。OS側 Spotify が音の主役。
  - **音あり時**：起動タップの**ユーザージェスチャ内で** `player.unMute()`（自動再生制約）。動画音声と OS音楽が二重になるため、運用者は**OS側 Spotify を手動停止**する前提（**アプリは Spotify を duck/停止できない**）。
- **チャイム**（Web Audio 合成）は従来どおり動画／音楽と独立に鳴る。無音モードでもチャイムは鳴る（Web Audio は別経路）。

---

## 6. キオスク／ブラウザ制約・ブートシーケンス

ブラウザの自動再生・スリープ・全画面制約に対応する。**2層**で堅牢化：アプリ層（どこでも動く1回タップ）＋キオスク層（管理端末の起動フラグ）。

**ブートシーケンス:**
0. （初回／セッション切れ時のみ）`MeProvider` が `/login` を表示 → 共有管理アカウントで Google ログイン。以降はセッション cookie で維持（既定7日）。
1. ログイン済みでロードすると、YouTube プレーヤーは **`mute:1` でミュート自動再生**しつつ「▶ タップして開始」全画面オーバーレイを表示。
2. タップハンドラ（1つのジェスチャ内で）：`audioCtx.resume()`（チャイム用 Web Audio の解放）→ `requestFullscreen()` →（**音ありモード設定時のみ** `player.unMute()`）→ `requestWakeLock()` → スケジューラ開始。
3. `visibilitychange`→visible：`audioCtx.resume()` 再実行・wake lock 再取得・即時 `tick()`。

> 注：起動タップの主目的は**チャイム（Web Audio）の解放・全画面・wake lock**。動画はミュートで自動再生済みなので、**無音モード（既定）ではタップ前から映像が出る**。音ありモードのときだけタップで `unMute()` する。

**個別制約:**
- **自動再生（YouTube IFrame）**：**ミュート自動再生は常時許可**（`autoplay:1, mute:1`）。**音声を出す unMute はユーザージェスチャ必須**。ジェスチャ無しの音付き自動再生は MEI / PWA インストール等に依存し**キオスク初期プロファイルでは不安定**なので当てにしない。検知用に **`onAutoplayBlocked`（2023-11 追加）** と `navigator.getAutoplayPolicy?.('mediaelement')` を併用してよい。
- **Screen Wake Lock**：`navigator.wakeLock.request('screen')`。**hidden で自動解放されるため `visibilitychange` で再取得**。HTTPS 必須。OS 側のスクリーンブランク無効化も併用（API 単独に依存しない）。
- **全画面/横向き/カーソル/スクロール**：本番は Chromium を `--kiosk --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0` で起動（音付き自動再生まで必要なら、enterprise policy（`AutoplayAllowed` / `AutoplayAllowlist` 等。**正確なポリシー名と挙動は導入する Chromium ビルドで要検証**）の併用がより確実。`--autoplay-policy` フラグは一部ビルドで無視される報告あり）。横向き・カーソル非表示・スリープ無効は **OS/ディスプレイ層**で固定。CSS は `html,body { height:100%; overflow:hidden; overscroll-behavior:none; touch-action:none; }`、タッチ専用なら `cursor:none`。なお**既定の無音モードなら音付き自動再生は不要**で、ミュート自動再生＋（任意の）タップ起動で十分。
- 主要参照は本ドキュメント末尾の出典（MDN/Chrome for Developers 等）。

---

## 7. 作成・変更するファイル一覧

**新規（packages/shared）**
- `packages/shared/src/activity-cycle.ts`
- `packages/shared/src/youtube.ts` … YouTube Data API `playlistItems.list` の fetch ラッパ（APIキーのみ・ページング・`privacyStatus` フィルタ・順序ソート。Workers安全）。
- `packages/shared/src/schemas/signage.ts` … `signagePlaylistItemSchema` / `signagePlaylistResponseSchema` ＋ `z.infer` 型。

**変更（packages/shared）**
- `packages/shared/package.json` … exports に `"./activity-cycle"` と `"./youtube"` を追加。
- `packages/shared/src/schemas/index.ts` … `export * from './signage'` を追加。

**新規・変更（apps/api）— コードあり**
- 新規 `apps/api/src/routes/signage.ts` … 外部パス `GET /api/signage/playlist`（ルート内のハンドラは `/playlist`、`index.ts` で `app.route('/api/signage', signageRoute)` マウント。`requireAuthenticatedMentor` 配下）。
- 新規 `apps/api/src/lib/signage.ts` … `fetchSignagePlaylist(env)`（`youtube.ts` を呼び・**数分の module-scope/Cache API キャッシュ**）。
- 変更 `apps/api/src/index.ts` … `app.route('/api/signage', signageRoute)` を追加（auth ミドルウェア共通適用）。
- 変更 `apps/api/src/types.ts` … `Bindings` に `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` を追加。
- 設定 `apps/api/.dev.vars`（ローカル）／ Wrangler Secrets（本番）：`TRUSTED_ORIGINS` にサイネージのオリジン、`YOUTUBE_API_KEY`、`YOUTUBE_PLAYLIST_ID` を追加。
- `.env.example` に `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID`（値なし・名前のみ）と `TRUSTED_ORIGINS` 例コメントを更新。

**新規（apps/signage、すべて）**
- 設定: `package.json`（`@types/youtube` devDep 追加）/ `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `components.json` / `.gitignore`
- 認証: `src/lib/auth-client.ts` / `src/app/login/page.tsx` / `src/components/app-shell.tsx`（MeProvider ラッパ）
- アプリ: `src/app/layout.tsx` / `src/app/page.tsx` / `src/app/manifest.ts`
- コンポーネント（目安）: `src/components/{tap-to-start,youtube-player,info-bar,break-screen,idle-screen,mute-toggle}.tsx`（`youtube-player`＝動画レイヤ＝旧 `stage.tsx` 置換、`mute-toggle`＝運用者向け無音切替UI）
- ロジック（目安）: `src/lib/{chimes,use-chime-scheduler,use-wake-lock,use-signage-data,use-playlist,use-youtube-player,use-mute}.ts`（`use-youtube-player`＝IFrame ライフサイクル＋自前キュー、`use-playlist`＝`/api/signage/playlist` 取得＋フォールバック、`use-mute`＝localStorage 永続トグル）
- フォールバック設定: `src/config/playlist.ts`（少数の動画ID直書き）
- ドキュメント: `CLAUDE.md` / `AGENTS.md`

**ドキュメント（フォロー）**
- `docs/architecture.md` のクライアント一覧／拡張ロードマップに `apps/signage`（認証あり）を追記。

---

## 8. 検証方法（end-to-end）

1. **共有ロジック**：`activity-cycle.ts` に単体テスト（境界値）。朝/昼/夕の各タームで `classifyCycleMoment` のフェーズ遷移、`cycleChimeEventsForDay` が 7×（稼働ターム数）件・時系列順・正しい JST instant、`msUntilNextBoundary` の符号と null（活動なし日）を検証。`pnpm --filter @tecnova/shared test`（無ければ vitest を最小導入）。
2. **認証＆データ**：`apps/api` の `TRUSTED_ORIGINS` に `http://localhost:3002` を追加。共有（or 任意のメンター）アカウントでログイン後、ブラウザから `/api/sessions/today` が 200 で取得でき、`sessions[].term`・`summary.currentlyPresent/totalCheckedIn` が返ることを確認。未ログインだと `MeProvider` が `/login` に飛ばすこと、ログイン後にサイネージが表示されることを確認。
3. **プレイリストAPI**：`.dev.vars` に `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` を設定し、ログイン済みで `GET /api/signage/playlist` が 200・`items[].videoId` を `snippet.position` 昇順で返すことを確認。50件超のページング、非公開/削除動画の除外、未ログイン 401、数分キャッシュ（短時間の連続呼び出しで Data API を叩かない）を確認。
4. **フロント結合**：`pnpm --filter signage dev`（:3002）。デバッグ用に「現在時刻を上書き」できる仕組み（クエリ `?now=2026-05-30T09:49:30+09:00` 等）を入れ、:50/:00 のクロスフェードとチャイム発火、稼働前 idle→初チェックインで activity への切替を確認。YouTube プレーヤーが**自前キューで次動画へ即差し替え**（関連動画/終了画面が出ない）こと、`prefers-reduced-motion` でトランジション縮約を確認。
5. **無音トグル**：既定が無音（`mute:1`・映像のみ）であること、トグルで音あり↔無音が切替わり localStorage に永続すること、音ありは起動タップ後に `unMute()` で鳴ること、無音モードでもチャイムが鳴ることを確認。
6. **キオスク確認**：実機 or Chrome で「タップして開始」後に wake lock・全画面が効くこと、（音ありモードなら）タブ復帰で音声が戻ること、ミュート動画はタップ前から再生されていることを確認。セッション維持（再読込でログイン不要）を確認。
7. `pnpm type-check` ／ `pnpm biome check .` 通過。

---

## 9. リスク・留意点・要確認

- **端末ローカル時計依存**：チャイム時刻は端末時計が正しい前提。キオスク端末は NTP 同期推奨。
- **セッション期限（既定7日）**：長期イベントではキオスクが再ログインを要する。必要なら `apps/api/src/lib/auth.ts` の `betterAuth({ session: { expiresIn } })` で延長（小さなコード変更）。会場運用上「数日に一度ログインし直す」で許容できるかを確認。
- **稼働判定の数十秒ラグ**：初チェックインから次ポーリングまで最大ポーリング間隔分、activity 化が遅れうる。:50 直前の初チェックインは当該休憩チャイムを逃す可能性（許容）。
- **同一日に一部タームのみ稼働**（例：土曜は朝のみ）：未稼働タームは件数0のまま idle ＝ 自動で無音。問題なし。
- **共有アカウントの運用**：壁の端末に共有メンターアカウントのログイン状態が乗る。最小権限（メンターロール）で運用し、漏洩時は当該アカウントの無効化／セッション失効で対応。
- **PII の取り扱い**：v1 は `/api/sessions/today` の PII を画面に出さない。将来ニックネーム等を出す場合も、認証経路は維持しつつ表示内容を設計で限定する。
- **自動再生フラグの不安定さ**：`--autoplay-policy` は一部 Chrome ビルドで無視されるため、enterprise policy ＋ アプリ内タップの二重化で担保。既定の**無音モードなら音付き自動再生は不要**で、ミュート自動再生のみで成立する。
- **YouTube 広告は完全には排除できない（§5.3）**：埋め込み側で広告は消せない。**広告ゼロを確実にできるのは YPP 加入チャンネルで収益化オフにした自前動画のみ**。YPP 非加入チャンネルの動画や第三者動画は YouTube/Content ID 由来の広告が出うる。プログラム的なスキップは ToS 違反。厳密な広告ゼロが要る時間帯は **self-host 方式（下記代替案）** を検討。
- **self-host 代替案（広告ゼロ厳守用）**：初版設計の HTML5 `<video>`＋CDN 方式は広告ゼロ・完全制御だが、ホスティング／差し替えの手間が増える。**YouTube との併用**（通常はYouTube、特定枠だけ self-host）も型上は可能。必要になったら別途スコープ化する。
- **YouTube IFrame の終了画面ちらつき**：`rel=0`/`modestbranding` では関連UIを消せないため、自前キューの**先回り差し替え（残り0.5〜1秒で `loadVideoById`）**で抑止する。完全な無欠は保証できない（許容）。
- **YouTube Data API のクォータ／キャッシュ**：`playlistItems.list` は 1呼び出し1ユニット・既定1万/日。サーバ側の数分キャッシュで十分余裕。API データの保存は Developer Policies の **30日上限**に留意（数分キャッシュは問題なし）。**APIキーは Worker Secret**（クライアントに出さない＝Public リポジトリ方針順守）。
- **Spotify は OS側・Premium 前提**：BGM はキオスク端末の Spotify アプリ（Connect）任せ。**広告ゼロには Premium が必須**（Free は曲間広告）。音ありモードでは動画音声と二重になるため運用者が OS 音楽を手動停止する（アプリは制御不可）。
- **プレイリストに再生不能動画**：API 側で `privacyStatus`（`public`/`unlisted` 以外）・欠落 `videoId` を除外しないとキューが詰まる。さらに**埋め込み禁止・地域制限は API では弾けない**ため、クライアントの `onError`（100/101/150）で次へ進める二重防御（§5.2）。空プレイリスト時はフォールバック設定（§5.4）→ それも空なら idle ロゴへ。

---

## 付録：主要参照ファイル（既存・再利用元）

- `apps/api/src/index.ts`（ルート登録順・CORS・認証 mount）
- `apps/api/src/middleware/{auth,cors}.ts`（`requireAuthenticatedMentor`・`createDb`・`apiCors`・`parseTrustedOrigins`）
- `apps/api/src/lib/auth.ts`（Better Auth 設定・`trustedOrigins`・セッション）
- `apps/api/src/routes/admin.ts`（`/me` L25-32・`/sessions/today` L37・`fetchTodaySessions`）
- `apps/api/src/lib/admin.ts`（`fetchSessionsForEvent`・`todayInJst`）
- `packages/shared/src/venue-schedule.ts`（`TERMS`・`classifyTerm`・`termEndInstant`・`toJstWallClock`・`toJstDateString`）
- `packages/shared/src/google-sheets.ts`（**サーバ側 fetch ＋ Web Crypto ＋ module-scope トークンキャッシュ**の流儀。YouTube Data API ラッパ `youtube.ts` の参照元。ただし APIキー方式なので JWT は不要）
- `packages/shared/src/schemas/{index,admin}.ts`（`todaySessionsResponseSchema` ＝ `term`/`summary` を含む。`schemas/signage.ts` 追加の参照元）
- `apps/checkin/*`（スキャフォルド＆認証複製元：`package.json`・`next.config.ts`・`tsconfig.json`・`postcss.config.mjs`・`components.json`・`src/lib/auth-client.ts`・`src/app/login/page.tsx`・`src/components/app-shell.tsx`・`src/app/{layout,manifest}.ts(x)`）
- `packages/ui/src/components/me-provider.tsx`（`MeProvider`・`useMe`・401→`/login`）
- `packages/ui/src/lib/{api-client,format,utils}.ts`（`apiJson`/`apiFetch`・JST整形・`cn`）

### 出典（YouTube / Spotify・2024–2026、改訂で追加）
- YouTube IFrame Player API reference（`onStateChange`・`YT.PlayerState.ENDED`・`loadVideoById`/`cueVideoById`・`mute`/`unMute`・`onAutoplayBlocked`）— developers.google.com/youtube/iframe_api_reference
- YouTube Player parameters（`controls`/`disablekb`/`fs`/`playsinline`/`iv_load_policy`／**`rel` の 2018-09-25 変更**・**`modestbranding` 2023-08-15 廃止**）— developers.google.com/youtube/player_parameters
- YouTube Data API v3 `playlistItems.list`（`part`・`maxResults`≤50・`pageToken`・`snippet.position`・**1ユニット/呼**）＋ quota — developers.google.com/youtube/v3
- YouTube API Services Developer Policies（**III.I.5–6 広告ブロック禁止**・**III.E.4 保存30日上限**）— developers.google.com/youtube/terms/developer-policies
- 埋め込み動画の広告は所有者の収益化設定に従う／YPP 非加入チャンネルにも YouTube が広告を置きうる — support.google.com/youtube/answer/132596・answer/2475463・answer/6332943
- 自動再生（ミュート自動再生は許可／unMute はジェスチャ必須）— Chrome for Developers autoplay / MDN Autoplay guide
- Spotify：Free は曲間広告／ad-free は Premium／Web Playback SDK は Premium＋OAuth(`streaming`) — spotify.com/premium・developer.spotify.com/documentation/web-playback-sdk

### 出典（ブラウザ制約・2025–2026）
- Autoplay guide — MDN / Chrome for Developers / Chromium project
- OscillatorNode・Advanced techniques (Web Audio) — MDN
- Screen Wake Lock API — Chrome for Developers / MDN / caniuse
- Accurate timers in JS（self-correcting setTimeout / Web Worker）— SitePoint / HackWild
- View Transitions・`<ViewTransition>`・prefers-reduced-motion — Chrome for Developers / React / MDN
- Chromium kiosk mode — Smartupworld / OSTechNix
