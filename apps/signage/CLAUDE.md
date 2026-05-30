@AGENTS.md

# signage（会場サイネージ / 大型モニター・キオスク）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3002`（`next dev --port 3002`）。api は `8787`、checkin は `3000`、admin は `3001`。
- **認証あり**: checkin/admin と同じメンター・ホワイトリスト（`MeProvider`/`auth-client`）。運用は**テクノバ共有の管理用 Google アカウント**で1回ログイン（セッション既定7日）。`useMe` はツリー内に `MeProvider` 必須。
- **データ**: 認証付き `GET /api/sessions/today` を再利用（稼働判定・在館数）。ターム別チェックイン数は `sessions[].term` から算出し、**現タームに当日チェックインが入った時点で稼働開始**（ターム終了まで sticky）。
- **レイアウト**: 配信（ブロードキャスト）風（`BroadcastFrame`）。上=`StageHeader`（ワードマーク・ステータス・JST時計）／中=`VideoStage`（縮小動画パネル。休憩・待機は `BreakOverlay`/`IdleOverlay` をパネル上にクロスフェード）＋右レーン `ChimeRail`（**チャイムの役割**＝次チャイムまでのカウントダウンリング・ターム・サイクル、idle 時は本日のスケジュール）／下=`InfoTicker`（動画タイトル・来場・にぎわい・主催/共催・tec-nova/tecnova-platform 紹介を巡回）。状態機械（activity/break/idle）と稼働判定は従来どおり `page.tsx` で算出し frame に渡すだけ。世界観は checkin に統一（`from-sky-50 to-white`・`motion` + `useReducedMotion`・`rounded-2xl`/`shadow-sm` カード）。にぎわいは `@tecnova/shared/attendance-level` の純粋ロジック由来。
- **時刻ロジック**: `@tecnova/shared/activity-cycle`（50分活動/10分休憩・チャイム時刻）。時刻ソースは `src/lib/now.ts` の `getNow()`（優先順位: デバッグ擬似時計 → `?now=ISO` アンカー → 実時刻）。
- **プレビュー/デバッグ**: `?debug=1` を付けたときだけ画面下部に操作バー（`DebugPanel`）が出る。本番壁面は `?debug=1` 無しで起動するので影響ゼロ（`debugEnabled=false` で全分岐が短絡＝従来挙動と完全同値）。擬似時計（ジャンプ/一時停止/×1×30×120）・稼働強制（チェックインデータ無しで活動/休憩を再現）・手動チャイムで、実時刻を待たずに全状態と各遷移＋チャイムを検証できる。下部インフォメーション（`InfoTicker`）には `?debug=1` のとき ◀▶ の手動送りが出る。ストアは `now.ts` に同居し `useSyncExternalStore` で購読。チャイムスケジューラは `jumpEpoch` で前方ジャンプ時の過去チャイム一斉発火を抑止する。
- **動画**: 縮小した動画パネル（`VideoStage`）に YouTube IFrame Player API の自前キューを**常時マウント**（`ENDED`/`onError` で次 videoId へ `loadVideoById`、活動フェーズのみ再生・他は pause）。再生順は YouTube のプレイリストを `GET /api/signage/playlist`（YouTube Data API・Worker キャッシュ）が videoId＋タイトル列にして返し、`usePlaylist` が保持／`useYoutubePlayer` の `onVideoChange` で現在トラックを通知（下部インフォの動画タイトル用）。フォールバックは `src/config/playlist.ts` の `FALLBACK_VIDEO_IDS`。**広告は埋め込み側で消せない**（仕様 §5.3）。
- **音声**: 無音/音ありのグローバルトグルのみ（既定=無音・localStorage）。BGM は **OS側 Spotify**（アプリ非統合）。チャイムは Web Audio 合成で独立。
- **キオスク**: 横向き・フルスクリーン。起動「タップして開始」で**チャイム解放・全画面・wake lock**（＋音ありモード時のみ動画 unMute）。ミュート動画はタップ前から再生。本番は Chromium を `--kiosk` 等で起動。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時 `http://localhost:8787`）。API 側 `TRUSTED_ORIGINS` にサイネージ origin（dev: `http://localhost:3002`、本番ドメイン）、`YOUTUBE_API_KEY`/`YOUTUBE_PLAYLIST_ID` を登録すること。
- 新しい `@tecnova/*` パッケージを使うときは `next.config.ts` の `transpilePackages` に追加。
