@AGENTS.md

# checkin（受付端末 / iPad PWA）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、上記 AGENTS.md の通り実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3000`（`next dev`）。api は `8787`、admin は `3001`。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時は `http://localhost:8787` にフォールバック）。`.env.example` は未整備なので存在を前提にしない。本番は Vercel 環境変数で設定。
- **PWA は iOS/Android 二重設定**: iOS は `src/app/layout.tsx` の `appleWebApp`、Android/Chromium は `src/app/manifest.ts`。**両方**必要で片方だけでは動かない。
- **新しい `@tecnova/*` パッケージを使うとき**: `next.config.ts` の `transpilePackages`（現状 `@tecnova/shared`, `@tecnova/ui`）に追加しないと ESM ビルドが壊れる。
- API 呼び出しは `@tecnova/ui` の `apiFetch`、ログインユーザーは `MeProvider` / `useMe()` を使う（`useMe` はツリー内に `MeProvider` が必須でないとランタイムエラー）。
