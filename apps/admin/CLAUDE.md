@AGENTS.md

# admin（管理画面 / PC）

- **Next.js 16 / React 19**。App Router の API がトレーニングデータと乖離しているため、上記 AGENTS.md の通り実装前に `node_modules/next/dist/docs/` を確認すること。
- **dev ポート**: `3001`（`next dev --port 3001`）。api は `8787`、checkin は `3000`。
- **必須 env**: `NEXT_PUBLIC_API_URL`（未設定時は `http://localhost:8787` にフォールバック）。サンプルはリポジトリ root の `.env.example` を参照（ローカルは `.env.local` にコピー）。本番は Vercel 環境変数で設定。
- **新しい `@tecnova/*` パッケージを使うとき**: `next.config.ts` の `transpilePackages`（現状 `@tecnova/shared`, `@tecnova/ui`）に追加しないと ESM ビルドが壊れる。
- 認証は `(authed)/layout.tsx` で `MeProvider` をラップする構成。API 呼び出しは `@tecnova/ui` の `apiFetch`、ユーザー情報は `useMe()` を使う。
